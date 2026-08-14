import { supabase } from '../lib/db-client.js';
import { requireAuth } from '../lib/requireAuth.js';
import { setCors } from '../lib/cors.js';
import { parseDepartmentCreate, parseId } from '../lib/validators.js';

export default async function handler(req, res) {
  setCors(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('departments').select('*').order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const parsed = parseDepartmentCreate(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error });
      }
      const { data, error } = await supabase.from('departments').insert({ name: parsed.data.name }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const parsedId = parseId(req.body ?? {});
      if (!parsedId.success) {
        return res.status(400).json({ error: parsedId.error });
      }
      const { id } = parsedId.data;
      const { ...rest } = req.body;
      const { data, error } = await supabase.from('departments').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
