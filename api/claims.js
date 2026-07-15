import supabase from './db-client.js';

const ALLOWED_CLAIM_TYPES = [
  'Fuel',
  'Parking',
  'Toll',
  'Medical',
  'Accommodation',
  'Travel',
  'Office Supplies',
  'Other',
];

function cleanString(value) {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getDistanceKm(start, end) {
  const s = toNumber(start, 0);
  const e = toNumber(end, 0);

  if (!s || !e || e <= s) return 0;

  return Math.round((e - s) * 100) / 100;
}

async function getEmployee(employeeId) {
  if (!employeeId) return null;

  const { data, error } = await supabase
    .from('employees')
    .select('id, name, email, role, department, title, status')
    .eq('id', Number(employeeId))
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

function isFinanceManager(actorRole, actorDepartment) {
  return (
    String(actorRole || '').toLowerCase() === 'manager' &&
    String(actorDepartment || '').trim().toLowerCase() === 'finance'
  );
}

function isAdmin(actorRole) {
  return String(actorRole || '').toLowerCase() === 'admin';
}

function isManager(actorRole) {
  return String(actorRole || '').toLowerCase() === 'manager';
}

function sameDepartment(a, b) {
  return (
    String(a || '').trim().toLowerCase() ===
    String(b || '').trim().toLowerCase()
  );
}

function normalizeClaimType(value) {
  const claimType = cleanString(value);

  return ALLOWED_CLAIM_TYPES.includes(claimType) ? claimType : 'Other';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // =========================
    // GET CLAIMS
    // =========================
    if (req.method === 'GET') {
      const { employee_id, status, payroll_period } = req.query;

      let query = supabase
        .from('claims')
        .select('*')
        .order('created_at', { ascending: false });

      if (employee_id) query = query.eq('employee_id', employee_id);
      if (status) query = query.eq('status', status);
      if (payroll_period) query = query.eq('payroll_period', payroll_period);

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json(data || []);
    }

    // =========================
    // CREATE CLAIM
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};

      if (!body.employee_id) {
        return res.status(400).json({
          error: 'Employee is required.',
        });
      }

      if (!body.claim_date) {
        return res.status(400).json({
          error: 'Claim date is required.',
        });
      }

      if (!body.description || !cleanString(body.description)) {
        return res.status(400).json({
          error: 'Purpose / description is required.',
        });
      }

      if (!body.amount || toNumber(body.amount) <= 0) {
        return res.status(400).json({
          error: 'Amount must be greater than 0.',
        });
      }

      if (!body.attachment_url) {
        return res.status(400).json({
          error: 'Receipt attachment is required.',
        });
      }

      const employee = await getEmployee(Number(body.employee_id));

      if (!employee) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      if (String(employee.status || '').toLowerCase() === 'inactive') {
        return res.status(403).json({
          error: 'Inactive employee cannot submit claims.',
        });
      }

      const claimType = normalizeClaimType(body.claim_type);
      const distanceKm = getDistanceKm(body.odometer_start, body.odometer_end);

      const payload = {
        employee_id: Number(body.employee_id),
        claim_type: claimType,
        claim_date: body.claim_date,
        amount: toNumber(body.amount),
        description: cleanString(body.description),

        vehicle_no: claimType === 'Fuel' ? body.vehicle_no || null : null,
        from_location: body.from_location || null,
        to_location: body.to_location || null,
        odometer_start:
          claimType === 'Fuel' &&
          body.odometer_start !== undefined &&
          body.odometer_start !== ''
            ? toNumber(body.odometer_start)
            : null,
        odometer_end:
          claimType === 'Fuel' &&
          body.odometer_end !== undefined &&
          body.odometer_end !== ''
            ? toNumber(body.odometer_end)
            : null,
        distance_km: claimType === 'Fuel' && distanceKm ? distanceKm : null,
        fuel_liters:
          claimType === 'Fuel' &&
          body.fuel_liters !== undefined &&
          body.fuel_liters !== ''
            ? toNumber(body.fuel_liters)
            : null,
        petrol_station:
          claimType === 'Fuel' ? body.petrol_station || null : null,
        receipt_no: body.receipt_no || null,

        attachment_url: body.attachment_url,
        attachment_name: body.attachment_name || null,

        status: 'pending_manager',
        included_in_payroll: false,
      };

      const { data, error } = await supabase
        .from('claims')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json(data);
    }

    // =========================
    // UPDATE CLAIM STATUS
    // =========================
    if (req.method === 'PUT') {
      const {
        id,
        action,
        actor_id,
        actor_name,
        actor_role,
        actor_department,
        rejection_reason,
        payroll_period,
      } = req.body || {};

      if (!id) {
        return res.status(400).json({
          error: 'id is required.',
        });
      }

      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (claimError) throw claimError;

      if (!claim) {
        return res.status(404).json({
          error: 'Claim not found.',
        });
      }

      const employee = await getEmployee(claim.employee_id);

      if (!employee) {
        return res.status(404).json({
          error: 'Claim employee not found.',
        });
      }

      const role = String(actor_role || '').toLowerCase();
      const admin = isAdmin(role);
      const manager = isManager(role);
      const financeManager = isFinanceManager(role, actor_department);

      if (action === 'cancel') {
        if (!actor_id) {
          return res.status(400).json({
            error: 'actor_id is required.',
          });
        }

        if (!admin && Number(actor_id) !== Number(claim.employee_id)) {
          return res.status(403).json({
            error: 'Only owner or admin can cancel this claim.',
          });
        }

        if (claim.status !== 'pending_manager') {
          return res.status(400).json({
            error: 'Only pending manager claims can be cancelled.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'cancelled',
            rejected_by: actor_name || 'Employee',
            rejected_at: new Date().toISOString(),
            rejection_reason: 'Cancelled by employee',
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      if (action === 'manager_approve') {
        if (claim.status !== 'pending_manager') {
          return res.status(400).json({
            error: 'Claim is not pending manager approval.',
          });
        }

        if (!admin) {
          if (!manager) {
            return res.status(403).json({
              error: 'Only manager or admin can approve this stage.',
            });
          }

          if (Number(actor_id) === Number(claim.employee_id)) {
            return res.status(403).json({
              error: 'Manager cannot approve own claim.',
            });
          }

          if (!sameDepartment(employee.department, actor_department)) {
            return res.status(403).json({
              error: 'Manager can only approve claims from own department.',
            });
          }
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'pending_finance',
            manager_approved_by: actor_name || 'Manager',
            manager_approved_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      if (action === 'finance_approve') {
        if (claim.status !== 'pending_finance') {
          return res.status(400).json({
            error: 'Claim is not pending finance approval.',
          });
        }

        if (!admin && !financeManager) {
          return res.status(403).json({
            error: 'Only Finance Manager or Admin can approve finance stage.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'approved',
            finance_approved_by: actor_name || 'Finance',
            finance_approved_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      if (action === 'reject') {
        if (!admin && !manager && !financeManager) {
          return res.status(403).json({
            error: 'Only manager, finance manager or admin can reject claims.',
          });
        }

        if (manager && !admin && !financeManager) {
          if (!sameDepartment(employee.department, actor_department)) {
            return res.status(403).json({
              error: 'Manager can only reject claims from own department.',
            });
          }
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'rejected',
            rejected_by: actor_name || 'Approver',
            rejected_at: new Date().toISOString(),
            rejection_reason: rejection_reason || 'Rejected',
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      if (action === 'mark_included') {
        if (!admin) {
          return res.status(403).json({
            error: 'Only admin can mark claim as included in payroll.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            payroll_period: payroll_period || claim.payroll_period,
            included_in_payroll: true,
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      return res.status(400).json({
        error: 'Invalid action.',
      });
    }

    // =========================
    // DELETE CLAIM
    // =========================
    if (req.method === 'DELETE') {
      const { id } = req.body || {};

      if (!id) {
        return res.status(400).json({
          error: 'id is required.',
        });
      }

      const { error } = await supabase.from('claims').delete().eq('id', id);

      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Claims API error:', err);

    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error.',
    });
  }
}