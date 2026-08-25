import { supabase } from '../../lib/db-client.js';
import { setCors } from '../../lib/cors.js';
import { dbError } from '../../lib/errors.js';
import { cleanString, publicEmployee, generateTempPassword } from '../../lib/employeeLogic.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'worker_login') {
        const rawId = cleanString(body.employee_no || body.employee_id || '');
        if (!rawId) return res.status(400).json({ error: 'Please enter your employee ID.' });

        let employee = null;
        const { data: byNo } = await supabase.from('employees').select('*').eq('employee_no', rawId).maybeSingle();
        if (byNo) employee = byNo;
        else {
          const numericId = Number(rawId);
          if (numericId) {
            const { data: byId } = await supabase.from('employees').select('*').eq('id', numericId).maybeSingle();
            employee = byId || null;
          }
        }

        if (!employee) return res.status(404).json({ error: 'No employee found with this ID.' });
        if (String(employee.status || '').toLowerCase() === 'inactive') return res.status(403).json({ error: 'This account is inactive. Please contact HR.' });

        const token = crypto.randomUUID();
        const { error: tokenError } = await supabase.from('worker_sessions').insert({ employee_id: employee.id, token, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
        if (tokenError) return res.status(500).json({ error: tokenError.message });

        return res.status(200).json({ token, employee: publicEmployee(employee) });
      }

      if (body.action === 'worker_session') {
        const token = cleanString(body.token);
        if (!token) return res.status(401).json({ error: 'Missing session token.' });

        const { data: session, error: sessionError } = await supabase.from('worker_sessions').select('*').eq('token', token).gt('expires_at', new Date().toISOString()).maybeSingle();
        if (sessionError || !session) return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });

        const { data: employee, error: employeeError } = await supabase.from('employees').select('*').eq('id', session.employee_id).maybeSingle();
        if (employeeError || !employee || String(employee.status || '').toLowerCase() === 'inactive') return res.status(401).json({ error: 'Account not found or inactive.' });

        return res.status(200).json({ employee: publicEmployee(employee) });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Worker Auth API error:', err);
    return dbError(res, err);
  }
}