import { supabase } from '../../lib/db-client.js';
import { requireAuth } from '../../lib/requireAuth.js';
import { assertAdmin } from '../../lib/authorize.js';
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
      if (req.query.announcements === 'true') {
        const { data, error } = await supabase
          .from('company_announcements')
          .select('*')
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }
      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      if (!assertAdmin(authUser, res)) return;

      const body = req.body || {};

      if (body.action === 'announcement_save') {
        const payload = {
          title: cleanString(body.title),
          body: cleanString(body.body),
          category: body.category || 'General',
          pinned: Boolean(body.pinned),
          expires_at: body.expires_at || null,
          updated_at: new Date().toISOString(),
        };
        if (!payload.title || !payload.body) return res.status(400).json({ error: 'Title and announcement body are required.' });
        if (await recordExists('company_announcements', [['title', payload.title, 'ilike']], body.id)) {
          return res.status(409).json({ error: 'An announcement with this title already exists.' });
        }

        let query = body.id ? supabase.from('company_announcements').update(payload).eq('id', Number(body.id)) : supabase.from('company_announcements').insert({ ...payload, created_by: authUser?.id || null, created_by_name: authUser?.name || null });
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'announcements', action: body.id ? 'announcement_update' : 'announcement_create', record_id: data?.id || null, changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, new_data: data });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'announcement_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('company_announcements').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('company_announcements').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({ module: 'announcements', action: 'announcement_delete', record_id: Number(body.id), changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, old_data: oldRow });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Announcements API error:', err);
    return dbError(res, err);
  }
}