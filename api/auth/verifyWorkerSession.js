import { supabase } from '../db-client.js';

export function readWorkerCookie(req) {
  const header = req.headers?.cookie || '';
  const match = header.match(/(?:^|;\s*)wtechr_worker_session=([^;]+)/);
  return match ? match[1] : null;
}

export function decodeWorkerPayload(cookieValue) {
  try {
    const json = Buffer.from(decodeURIComponent(cookieValue), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function verifyWorkerSession(req) {
  const cookieValue = readWorkerCookie(req);
  if (!cookieValue) return null;
  const payload = decodeWorkerPayload(cookieValue);
  const token = payload?.token;
  if (!token) return null;
  const { data, error } = await supabase
    .from('worker_sessions')
    .select('employee_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return payload.employee ?? null;
}
