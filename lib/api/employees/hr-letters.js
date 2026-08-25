import { supabase } from '../../lib/db-client.js';
import { requireAuth } from '../../lib/requireAuth.js';
import { assertAdmin, assertAdminOrManager } from '../../lib/authorize.js';
import { setCors } from '../../lib/cors.js';
import { dbError } from '../../lib/errors.js';
import { safeInsertSystemAudit } from '../employees.js';
import { recordExists, cleanString } from './helpers.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    if (req.method === 'GET') {
      if (req.query.hr_letters === 'true') {
        let query = supabase.from('hr_letters').select('*').order('created_at', { ascending: false });
        if (req.query.employee_id) query = query.eq('employee_id', Number(req.query.employee_id));
        const { data, error } = await query;
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }
      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      if (!assertAdminOrManager(authUser, res)) return;

      const body = req.body || {};

      if (body.action === 'hr_letter_save') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.title || !body.content) return res.status(400).json({ error: 'employee_id, title and content are required.' });
        if (await recordExists('hr_letters', [['employee_id', employeeId], ['title', cleanString(body.title), 'ilike']], body.id)) {
          return res.status(409).json({ error: 'This employee already has an HR letter with the same title.' });
        }

        const payload = { employee_id: employeeId, template_type: body.template_type || 'general_letter', title: cleanString(body.title), content: String(body.content), status: body.status || 'draft', generated_by: authUser?.id || null, generated_by_name: authUser?.name || null, updated_at: new Date().toISOString() };
        let query = body.id ? supabase.from('hr_letters').update(payload).eq('id', Number(body.id)) : supabase.from('hr_letters').insert(payload);
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'hr_letters', action: body.id ? 'letter_update' : 'letter_create', record_id: data?.id || null, employee_id: employeeId, changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, new_data: data });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'hr_letter_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('hr_letters').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('hr_letters').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({ module: 'hr_letters', action: 'letter_delete', record_id: Number(body.id), employee_id: oldRow?.employee_id || null, changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, old_data: oldRow });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('HR Letters API error:', err);
    return dbError(res, err);
  }
}