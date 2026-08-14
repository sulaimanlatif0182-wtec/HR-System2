import { createClient } from '@supabase/supabase-js';
import { supabase } from '../db-client.js';

const anonUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const anonKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const verifyClient = anonUrl && anonKey ? createClient(anonUrl, anonKey) : null;

export async function getBearer(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const apikey = req.headers?.apikey;
  if (apikey) return apikey;
  return null;
}

export async function requireAuth(req, res) {
  const token = await getBearer(req);
  if (!token || !verifyClient) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data, error } = await verifyClient.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data: emp, error: empError } = await supabase
    .from('employees')
    .select('id, name, email, role, category, employee_no, status')
    .eq('id', data.user.id)
    .maybeSingle();
  if (empError || !emp) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  req.user = {
    id: emp.id,
    name: emp.name ?? '',
    email: emp.email ?? data.user.email ?? '',
    role: emp.role ?? 'employee',
    category: emp.category ?? 'employee',
    employee_no: emp.employee_no ?? null,
    status: emp.status ?? 'active',
  };
  return req.user;
}

export async function requireRole(req, res, roles = []) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}
