import { supabase } from './db-client.js';

const EMPLOYEE_FIELDS =
  'id, name, email, role, category, department, title, status, employee_no, phone, location, join_date, salary, avatar_url';

export function readWorkerCookie(req) {
  const header = req.headers?.cookie || '';
  const match = header.match(/(?:^|;\s*)wtechr_worker_session=([^;]+)/);
  return match ? match[1] : null;
}

export function decodeWorkerToken(cookieValue) {
  try {
    // The cookie is written as base64url (api/auth/worker-login.js encodes it
    // with Buffer.toString('base64url')). Decoding it as plain base64 corrupts
    // the payload whenever a '-' or '_' character is present.
    const json = Buffer.from(cookieValue, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return typeof parsed?.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

export function toEmployeeProfile(employee) {
  return {
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
  };
}

export async function verifyWorkerSession(req) {
  const cookieValue = readWorkerCookie(req);
  if (!cookieValue) return null;
  const token = decodeWorkerToken(cookieValue);
  if (!token) return null;

  const { data: session, error } = await supabase
    .from('worker_sessions')
    .select('employee_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (error || !session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  // Fetch the profile from the employees table rather than trusting any data
  // embedded in the cookie: role/status changes and deactivations apply
  // immediately, and no salary/personal data ever leaves the server.
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select(EMPLOYEE_FIELDS)
    .eq('id', session.employee_id)
    .neq('status', 'inactive')
    .maybeSingle();
  if (empError || !employee) return null;

  return toEmployeeProfile(employee);
}