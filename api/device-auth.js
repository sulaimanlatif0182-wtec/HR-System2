import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import supabase from './db-client.js';

const RP_NAME = 'WtecHR';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'hr-system2.vercel.app';
const ORIGIN =
  process.env.WEBAUTHN_ORIGIN || 'https://hr-system2.vercel.app';

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url');
}

function expiresInMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function getEmployee(employeeId) {
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, email, role, department, status')
    .eq('id', Number(employeeId))
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

async function saveChallenge(employeeId, challenge, purpose) {
  await supabase.from('webauthn_challenges').insert({
    employee_id: Number(employeeId),
    challenge,
    purpose,
    expires_at: expiresInMinutes(5),
  });
}

async function getLatestChallenge(employeeId, purpose) {
  const { data, error } = await supabase
    .from('webauthn_challenges')
    .select('*')
    .eq('employee_id', Number(employeeId))
    .eq('purpose', purpose)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // =========================
    // LIST DEVICES
    // =========================
    if (req.method === 'GET') {
      const employeeId = Number(req.query.employee_id);

      if (!employeeId) {
        return res.status(400).json({
          error: 'employee_id is required.',
        });
      }

      const { data, error } = await supabase
        .from('employee_devices')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return res.status(200).json(data || []);
    }

    // =========================
    // POST ACTIONS
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // =========================
      // REGISTRATION OPTIONS
      // =========================
      if (action === 'registration_options') {
        const employeeId = Number(body.employee_id);

        if (!employeeId) {
          return res.status(400).json({
            error: 'employee_id is required.',
          });
        }

        const employee = await getEmployee(employeeId);

        if (!employee) {
          return res.status(404).json({
            error: 'Employee not found.',
          });
        }

        if (String(employee.status || '').toLowerCase() === 'inactive') {
          return res.status(403).json({
            error: 'Inactive employee cannot register attendance device.',
          });
        }

        const { data: existingDevices, error: deviceError } = await supabase
          .from('employee_devices')
          .select('credential_id')
          .eq('employee_id', employeeId);

        if (deviceError) throw deviceError;

        const options = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: RP_ID,
          userID: Buffer.from(String(employee.id)),
          userName: employee.email || `employee-${employee.id}`,
          userDisplayName: employee.name || `Employee ${employee.id}`,
          attestationType: 'none',
          excludeCredentials: (existingDevices || []).map((device) => ({
            id: device.credential_id,
            type: 'public-key',
          })),
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
        });

        await saveChallenge(employeeId, options.challenge, 'register');

        return res.status(200).json(options);
      }

      // =========================
      // VERIFY REGISTRATION
      // =========================
      if (action === 'registration_verify') {
        const employeeId = Number(body.employee_id);
        const response = body.response;
        const deviceName = body.device_name || 'Attendance Device';
        const userAgent = body.user_agent || null;

        if (!employeeId || !response) {
          return res.status(400).json({
            error: 'employee_id and response are required.',
          });
        }

        const challengeRow = await getLatestChallenge(employeeId, 'register');

        if (!challengeRow) {
          return res.status(400).json({
            error: 'Registration challenge expired. Please try again.',
          });
        }

        const verification = await verifyRegistrationResponse({
          response,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          requireUserVerification: true,
        });

        if (!verification.verified || !verification.registrationInfo) {
          return res.status(400).json({
            error: 'Device registration failed.',
          });
        }

        const { credentialID, credentialPublicKey, counter } =
          verification.registrationInfo;

        const credentialId = toBase64Url(credentialID);
        const publicKey = toBase64Url(credentialPublicKey);

        const { data, error } = await supabase
          .from('employee_devices')
          .insert({
            employee_id: employeeId,
            credential_id: credentialId,
            public_key: publicKey,
            counter: counter || 0,
            device_name: deviceName,
            user_agent: userAgent,
            status: 'pending',
          })
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          device: data,
          message:
            'Device registered. Please wait for admin approval before using it for attendance.',
        });
      }

      // =========================
      // AUTH OPTIONS
      // =========================
      if (action === 'authentication_options') {
        const employeeId = Number(body.employee_id);

        if (!employeeId) {
          return res.status(400).json({
            error: 'employee_id is required.',
          });
        }

        const { data: devices, error } = await supabase
          .from('employee_devices')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('status', 'approved')
          .is('revoked_at', null);

        if (error) throw error;

        if (!devices || devices.length === 0) {
          return res.status(403).json({
            error:
              'No approved attendance device found. Please register this device and wait for admin approval.',
          });
        }

        const options = await generateAuthenticationOptions({
          rpID: RP_ID,
          userVerification: 'required',
          allowCredentials: devices.map((device) => ({
            id: device.credential_id,
            type: 'public-key',
          })),
        });

        await saveChallenge(employeeId, options.challenge, 'authenticate');

        return res.status(200).json(options);
      }

      // =========================
      // VERIFY AUTHENTICATION
      // =========================
      if (action === 'authentication_verify') {
        const employeeId = Number(body.employee_id);
        const response = body.response;
        const purpose = body.purpose || 'attendance_check_in';

        if (!employeeId || !response) {
          return res.status(400).json({
            error: 'employee_id and response are required.',
          });
        }

        const credentialId = response.id;

        const { data: device, error: deviceError } = await supabase
          .from('employee_devices')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('credential_id', credentialId)
          .eq('status', 'approved')
          .is('revoked_at', null)
          .maybeSingle();

        if (deviceError) throw deviceError;

        if (!device) {
          return res.status(403).json({
            error: 'This device is not approved for attendance.',
          });
        }

        const challengeRow = await getLatestChallenge(
          employeeId,
          'authenticate'
        );

        if (!challengeRow) {
          return res.status(400).json({
            error: 'Authentication challenge expired. Please try again.',
          });
        }

        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          authenticator: {
            credentialID: fromBase64Url(device.credential_id),
            credentialPublicKey: fromBase64Url(device.public_key),
            counter: Number(device.counter || 0),
          },
          requireUserVerification: true,
        });

        if (!verification.verified) {
          return res.status(403).json({
            error: 'Device verification failed.',
          });
        }

        await supabase
          .from('employee_devices')
          .update({
            counter: verification.authenticationInfo.newCounter,
          })
          .eq('id', device.id);

        const token = crypto.randomUUID();

        const { data: authToken, error: tokenError } = await supabase
          .from('device_auth_tokens')
          .insert({
            employee_id: employeeId,
            device_id: device.id,
            token,
            purpose,
            expires_at: expiresInMinutes(2),
          })
          .select()
          .single();

        if (tokenError) throw tokenError;

        return res.status(200).json({
          success: true,
          token: authToken.token,
          device_id: device.id,
        });
      }

      return res.status(400).json({
        error: 'Invalid action.',
      });
    }

    // =========================
    // ADMIN APPROVE / REVOKE DEVICE
    // =========================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const { action, id, approved_by, approved_by_name } = body;

      if (!id) {
        return res.status(400).json({
          error: 'Device id is required.',
        });
      }

      if (action === 'approve') {
        const { data, error } = await supabase
          .from('employee_devices')
          .update({
            status: 'approved',
            approved_by: approved_by || null,
            approved_by_name: approved_by_name || null,
            approved_at: new Date().toISOString(),
            revoked_at: null,
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json({
          success: true,
          device: data,
        });
      }

      if (action === 'revoke') {
        const { data, error } = await supabase
          .from('employee_devices')
          .update({
            status: 'revoked',
            revoked_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json({
          success: true,
          device: data,
        });
      }

      return res.status(400).json({
        error: 'Invalid action.',
      });
    }

    return res.status(405).json({
      error: 'Method not allowed.',
    });
  } catch (err) {
    console.error('Device auth error:', err);

    return res.status(500).json({
      error:
        err?.message ||
        err?.details ||
        err?.hint ||
        err?.code ||
        JSON.stringify(err) ||
        'Internal server error.',
    });
  }
}