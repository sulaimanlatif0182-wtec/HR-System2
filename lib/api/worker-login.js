import { supabase } from '../../lib/db-client.js';
import crypto from 'crypto';
import { setCors } from '../../lib/cors.js';
import { dbError } from '../../lib/errors.js';
import { isRateLimited } from '../../lib/rateLimit.js';
import { verifyWorkerSession, decodeWorkerToken, toEmployeeProfile } from '../../lib/verifyWorkerSession.js';
import { parseWorkerLogin } from '../../lib/validators.js';

const WORKER_SESSION_COOKIE = 'wtechr_worker_session';
const SESSION_TTL_DAYS = 30;

function encodeCookie(token) {
  const payload = Buffer.from(JSON.stringify({ token })).toString('base64url');
  return { token, payload };
}

function setWorkerSessionCookie(res, payload) {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  res.setHeader('Set-Cookie', [
    `${WORKER_SESSION_COOKIE}=${payload}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
  ]);
}

function clearWorkerSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    `${WORKER_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
  ]);
}

async function destroySession(token) {
  if (!token) return;
  await supabase.from('worker_sessions').delete().eq('token', token);
}

export default async function handler(req, res) {
  setCors(res, req);

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const parsed = parseWorkerLogin(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error });
      }
      const cleanEmployeeNo = parsed.data.employee_no;

      if (await isRateLimited(`worker-login:${cleanEmployeeNo}`, { windowMs: 60 * 1000, max: 10 })) {
        return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      }

      const { data: employee, error } = await supabase
        .from('employees')
        .select(
          'id, name, email, role, category, department, title, status, employee_no, phone, location, join_date, salary, avatar_url'
        )
        .eq('employee_no', cleanEmployeeNo)
        .neq('status', 'inactive')
        .maybeSingle();

      if (error) throw error;

      if (!employee) {
        return res.status(401).json({ error: 'Invalid employee number or account inactive.' });
      }

      if (employee.category !== 'worker') {
        return res.status(403).json({ error: 'Worker login is only for employees with worker category.' });
      }

      const { token, payload } = encodeCookie(crypto.randomBytes(32).toString('hex'));

      const expiresAt = new Date(
        Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      const { error: insertError } = await supabase
        .from('worker_sessions')
        .insert({ employee_id: employee.id, token, expires_at: expiresAt });
      if (insertError) throw insertError;

      setWorkerSessionCookie(res, payload);
      // Only the session token travels in the cookie; this profile is the same
      // row just fetched from the DB and is re-resolved server-side on every
      // subsequent request via verifyWorkerSession().
      return res.status(200).json({ employee: toEmployeeProfile(employee) });
    }

    if (req.method === 'GET') {
      const employee = await verifyWorkerSession(req);
      // Return 200 (with no employee) instead of 401 when there is simply no
      // active worker session. A 401 here is expected on every fresh load and
      // only produces misleading "Failed to load resource" console noise; the
      // client treats a missing employee as "no session" either way.
      if (!employee) return res.status(200).json({ employee: null });
      return res.status(200).json({ employee });
    }

    if (req.method === 'DELETE') {
      const cookieValue = req.headers?.cookie?.match(
        /(?:^|;\s*)wtechr_worker_session=([^;]+)/
      )?.[1];
      if (cookieValue) {
        await destroySession(decodeWorkerToken(cookieValue));
      }
      clearWorkerSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Worker login error:', err);
    dbError(res, err, 'Login failed.');
  }
}