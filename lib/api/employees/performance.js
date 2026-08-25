import { supabase } from '../../lib/db-client.js';
import { requireAuth } from '../../lib/requireAuth.js';
import { assertAdmin, assertAdminOrManager } from '../../lib/authorize.js';
import { setCors } from '../../lib/cors.js';
import { dbError } from '../../lib/errors.js';
import { safeInsertSystemAudit } from '../employees/index.js';
import { recordExists, cleanString, toNullableNumber } from './helpers.js';
import { EVALUATION_CATEGORIES, sanitizeTemplateSections, templateCriteriaSections, sanitizeEvaluationScores, computeOverallScore } from '../../lib/employeeLogic.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    if (req.method === 'GET') {
      if (req.query.performance_reviews === 'true') {
        let query = supabase.from('performance_reviews').select('*').order('review_period', { ascending: false }).order('created_at', { ascending: false });
        if (authUser.category === 'worker') query = query.eq('employee_id', authUser.id);
        else if (req.query.employee_id) query = query.eq('employee_id', Number(req.query.employee_id));
        const { data, error } = await query;
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }

      if (req.query.evaluation_templates === 'true') {
        let query = supabase.from('evaluation_templates').select('*').order('created_at', { ascending: false });
        if (req.query.category) query = query.eq('category', cleanString(req.query.category));
        const { data, error } = await query;
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }

      if (req.query.evaluations === 'true') {
        let query = supabase.from('evaluations').select('*').order('review_period', { ascending: false }).order('created_at', { ascending: false });
        if (authUser.category === 'worker') query = query.eq('employee_id', authUser.id);
        else if (req.query.employee_id) query = query.eq('employee_id', Number(req.query.employee_id));
        if (req.query.evaluator_id) query = query.eq('evaluator_id', Number(req.query.evaluator_id));
        const { data, error } = await query;
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }

      if (req.query.worker_rules === 'true') {
        let query = supabase.from('worker_evaluation_rules').select('*');
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

      if (body.action === 'performance_save') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.review_period) return res.status(400).json({ error: 'employee_id and review_period are required.' });
        if (await recordExists('performance_reviews', [['employee_id', employeeId], ['review_period', cleanString(body.review_period)], ['review_type', body.review_type || 'Annual Review']], body.id)) {
          return res.status(409).json({ error: 'This employee already has the same review type for this review period.' });
        }

        const payload = { employee_id: employeeId, review_period: cleanString(body.review_period), review_type: body.review_type || 'Annual Review', reviewer_id: body.reviewer_id || authUser?.id || null, reviewer_name: body.reviewer_name || authUser?.name || null, kpi_score: toNullableNumber(body.kpi_score) || 0, behavior_score: toNullableNumber(body.behavior_score) || 0, attendance_score: toNullableNumber(body.attendance_score) || 0, overall_score: toNullableNumber(body.overall_score) || 0, strengths: body.strengths || null, improvements: body.improvements || null, goals: body.goals || null, recommendation: body.recommendation || null, manager_remarks: body.manager_remarks || null, admin_remarks: body.admin_remarks || null, status: body.status || 'draft', updated_at: new Date().toISOString() };
        let query = body.id ? supabase.from('performance_reviews').update(payload).eq('id', Number(body.id)) : supabase.from('performance_reviews').insert(payload);
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'performance', action: body.id ? 'review_update' : 'review_create', record_id: data?.id || null, employee_id: employeeId, changed_by: authUser?.id || body.reviewer_id || null, changed_by_name: authUser?.name || body.reviewer_name || null, new_data: data });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'performance_acknowledge') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.id) return res.status(400).json({ error: 'id and employee_id are required.' });
        const { data: existing } = await supabase.from('performance_reviews').select('*').eq('id', Number(body.id)).maybeSingle();
        if (!existing) return res.status(404).json({ error: 'Performance review not found.' });
        if (Number(existing.employee_id) !== employeeId) return res.status(403).json({ error: 'Employees can only acknowledge their own reviews.' });
        if (existing.employee_acknowledged) return res.status(409).json({ error: 'This review has already been acknowledged.' });

        const { data, error } = await supabase.from('performance_reviews').update({ employee_acknowledged: true, employee_acknowledged_at: new Date().toISOString(), acknowledged_by: employeeId, acknowledged_by_name: body.employee_name || null, updated_at: new Date().toISOString() }).eq('id', Number(body.id)).select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'performance', action: 'review_acknowledge', record_id: data?.id || null, employee_id: employeeId, changed_by: employeeId, changed_by_name: body.employee_name || null, new_data: data });
        return res.status(200).json(data);
      }

      if (body.action === 'performance_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('performance_reviews').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('performance_reviews').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({ module: 'performance', action: 'review_delete', record_id: Number(body.id), employee_id: oldRow?.employee_id || null, changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, old_data: oldRow });
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'template_save') {
        if (!assertAdmin(authUser, res)) return;
        const name = cleanString(body.name);
        const category = cleanString(body.category).toLowerCase();
        if (!name) return res.status(400).json({ error: 'Template name is required.' });
        if (!EVALUATION_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Template category must be Worker, Employee or Manager.' });

        const sections = sanitizeTemplateSections(body.sections);
        if (!sections.length) return res.status(400).json({ error: 'Template must contain at least one section with scored criteria.' });

        const payload = { name, category, department: cleanString(body.department) || null, description: cleanString(body.description) || null, sections, status: body.status === 'inactive' ? 'inactive' : 'active', updated_at: new Date().toISOString() };
        let query = body.id ? supabase.from('evaluation_templates').update(payload).eq('id', Number(body.id)) : supabase.from('evaluation_templates').insert({ ...payload, created_by: authUser?.id || null, created_by_name: authUser?.name || null });
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'performance', action: body.id ? 'template_update' : 'template_create', record_id: data?.id || null, changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, new_data: data });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'template_delete') {
        if (!assertAdmin(authUser, res)) return;
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('evaluation_templates').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('evaluation_templates').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({ module: 'performance', action: 'template_delete', record_id: Number(body.id), changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, old_data: oldRow });
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'evaluation_save') {
        if (!['admin', 'manager'].includes(authUser.role)) return res.status(403).json({ error: 'Only admin or manager can submit evaluations.' });
        const templateId = Number(body.template_id);
        const employeeId = Number(body.employee_id);
        if (!templateId || !employeeId || !cleanString(body.review_period)) return res.status(400).json({ error: 'template_id, employee_id and review_period are required.' });

        const { data: template, error: templateError } = await supabase.from('evaluation_templates').select('*').eq('id', templateId).maybeSingle();
        if (templateError) return res.status(500).json({ error: templateError.message });
        if (!template) return res.status(404).json({ error: 'Evaluation template not found.' });
        if (String(template.status || '').toLowerCase() === 'inactive') return res.status(403).json({ error: 'This evaluation template is inactive.' });

        const scores = sanitizeEvaluationScores(body.scores, template.sections);
        const overallScore = computeOverallScore(scores, template.sections);
        const payload = { template_id: templateId, employee_id: employeeId, evaluator_id: body.evaluator_id || authUser?.id || null, evaluator_name: body.evaluator_name || authUser?.name || null, evaluator_role: body.evaluator_role || authUser.role, review_period: cleanString(body.review_period), scores, overall_score: overallScore, status: body.status === 'completed' ? 'completed' : 'draft', updated_at: new Date().toISOString() };
        let query = body.id ? supabase.from('evaluations').update(payload).eq('id', Number(body.id)) : supabase.from('evaluations').insert(payload);
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'performance', action: body.id ? 'evaluation_update' : 'evaluation_create', record_id: data?.id || null, employee_id: employeeId, changed_by: payload.evaluator_id, changed_by_name: payload.evaluator_name, new_data: data });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'evaluation_acknowledge') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.id) return res.status(400).json({ error: 'id and employee_id are required.' });
        const { data: existing } = await supabase.from('evaluations').select('*').eq('id', Number(body.id)).maybeSingle();
        if (!existing) return res.status(404).json({ error: 'Evaluation not found.' });
        if (Number(existing.employee_id) !== employeeId) return res.status(403).json({ error: 'Employees can only acknowledge their own evaluations.' });
        if (existing.employee_acknowledged) return res.status(409).json({ error: 'This evaluation has already been acknowledged.' });

        const { data, error } = await supabase.from('evaluations').update({ employee_acknowledged: true, employee_acknowledged_at: new Date().toISOString(), acknowledged_by: employeeId, acknowledged_by_name: body.employee_name || null, updated_at: new Date().toISOString() }).eq('id', Number(body.id)).select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'performance', action: 'evaluation_acknowledge', record_id: data?.id || null, employee_id: employeeId, changed_by: employeeId, changed_by_name: body.employee_name || null, new_data: data });
        return res.status(200).json(data);
      }

      if (body.action === 'evaluation_delete') {
        if (!['admin', 'manager'].includes(authUser.role)) return res.status(403).json({ error: 'Only admin or manager can delete evaluations.' });
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('evaluations').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('evaluations').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({ module: 'performance', action: 'evaluation_delete', record_id: Number(body.id), employee_id: oldRow?.employee_id || null, changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, old_data: oldRow });
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'worker_rule_save') {
        if (!assertAdmin(authUser, res)) return;
        const employeeId = Number(body.employee_id);
        const templateId = Number(body.template_id);
        if (!employeeId) return res.status(400).json({ error: 'employee_id is required.' });

        let criteria = [];
        if (templateId) {
          const { data: template, error: templateError } = await supabase.from('evaluation_templates').select('*').eq('id', templateId).maybeSingle();
          if (templateError) return res.status(500).json({ error: templateError.message });
          if (!template) return res.status(404).json({ error: 'Template not found.' });
          const allowedIds = new Set((Array.isArray(body.criteria) ? body.criteria : []).map((c) => cleanString(c)));
          criteria = templateCriteriaSections(template.sections).map((criterion) => ({ id: criterion.id, name: criterion.name, max_score: criterion.max_score })).filter((criterion) => allowedIds.has(criterion.id));
        }

        const payload = { employee_id: employeeId, template_id: templateId || null, criteria, active: body.active !== false, updated_by: authUser?.id || null, updated_by_name: authUser?.name || null, updated_at: new Date().toISOString() };
        const { data, error } = await supabase.from('worker_evaluation_rules').upsert(payload, { onConflict: 'employee_id' }).select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'performance', action: 'worker_rule_save', record_id: data?.id || null, employee_id: employeeId, changed_by: payload.updated_by, changed_by_name: payload.updated_by_name, new_data: data });
        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Performance API error:', err);
    return dbError(res, err);
  }
}
