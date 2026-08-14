import { supabase } from '../../lib/db-client.js';
import crypto from 'crypto';
import { setCors } from '../../lib/cors.js';
import { verifyWorkerSession } from '../../lib/verifyWorkerSession.js';
import { parseWorkerLogin } from '../../lib/validators.js';

const WORKER_SESSION_COOKIE = 'wtechr_worker_session';
const SESSION_TTL_DAYS = 30;
const RATE_LIMIT = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10;

function isRateLimited(employeeNo) {
  const now = Date.now();
  const rec = RATE_LIMIT.get(employeeNo);
  if (!rec || now - rec.first > RATE_WINDOW_MS) {
    RATE_LIMIT.set(employeeNo, { first: now, count: 1 });
    return false;
  }
  rec.count += 1;
  if (rec.count > RATE_MAX) {
    if (now - rec.first <= RATE_WINDOW_MS) return true;
    RATE_LIMIT.set(employeeNo, { first: now, count: 1 });
    return false;
  }
  return false;
}

function encodeCookie(employee) {
  const token = crypto.randomBytes(32).toString('hex');
  const payload = Buffer.from(JSON.stringify({ token, employee })).toString('base64url');
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

      if (isRateLimited(cleanEmployeeNo)) {
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

      const { token, payload } = encodeCookie({
        id: Number(employee.id),
        name: employee.name ?? '',
        email: employee.email ?? '',
        role: employee.role ?? 'employee',
        category: employee.category ?? 'worker',
        department: employee.department ?? null,
        title: employee.title ?? null,
        status: employee.status ?? 'active',
        phone: employee.phone ?? null,
        location: employee.location ?? null,
        join_date: employee.join_date ?? null,
        salary: employee.salary ?? null,
        avatar_url: employee.avatar_url ?? null,
        employee_no: employee.employee_no ?? null,
      });

      const expiresAt = new Date(
        Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      const { error: insertError } = await supabase
        .from('worker_sessions')
        .insert({ employee_id: employee.id, token, expires_at: expiresAt });
      if (insertError) throw insertError;

      setWorkerSessionCookie(res, payload);
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return res.status(200).json({ employee: decoded.employee });
    }

    if (req.method === 'GET') {
      const employee = await verifyWorkerSession(req);
      if (!employee) return res.status(401).json({ error: 'Session invalid or expired.' });
      return res.status(200).json({ employee });
    }

    if (req.method === 'DELETE') {
      const cookieValue = req.headers?.cookie?.match(
        /(?:^|;\s*)wtechr_worker_session=([^;]+)/
      )?.[1];
      if (cookieValue) {
        try {
          const token = JSON.parse(
            Buffer.from(cookieValue, 'base64url').toString('utf8')
          ).token;
          await destroySession(token);
        } catch {
          // ignore decode errors
        }
      }
      clearWorkerSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Worker login error:', err);
    return res.status(500).json({ error: err.message || 'Login failed.' });
  }
}
