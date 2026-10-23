import { supabase } from '../../../lib/db-client.js';
import { requireAuth } from '../../../lib/requireAuth.js';
import { assertAdminOrManager } from '../../../lib/authorize.js';
import { setCors } from '../../../lib/cors.js';
import { dbError } from '../../../lib/errors.js';
import { safeInsertSystemAudit } from '../employees/index.js';
import { requireFeature } from '../../../lib/feature-flags.js';
import { cleanString } from './helpers.js';
import {
  EVAL_TEMPLATE_TYPES,
  sanitizeTemplateSections,
  sanitizeEvaluationScores,
  computeOverallScore,
} from '../../../lib/employeeLogic.js';

// Department-scoped Evaluation module.
// - Templates: created by admin/manager, forced to the creator's department,
//   readable only inside that department (admins see ONLY their own dept too).
//   Each template carries a `type` (performance_increment | confirmation | bonus
//   | promotion) and the role of its creator (`created_by_role`).
// - Evaluations: SELF-evaluations. Every user answers forms on themselves:
//   staff answer manager-created forms, managers answer admin-created forms,
//   admins answer admin-created forms — always within their own department.
//   Completed evaluations are locked; the subject can acknowledge their own.
// - The legacy Appraisal module and worker rules were removed with this rewrite.

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    if (req.method === 'GET') {
      const viewerDept = authUser.department || null;

      if (req.query.evaluation_templates === 'true') {
        if (!viewerDept) return res.status(200).json([]);
        let query = supabase
          .from('evaluation_templates')
          .select('*')
          .eq('department', viewerDept)
          .order('created_at', { ascending: false });
        const { data, error } = await query;
        if (error) return dbError(res, error);
        let rows = data || [];
        // Staff may only ever see the manager-created forms they are asked to answer.
        if (authUser.role === 'employee') {
          rows = rows.filter((row) => String(row.created_by_role || '') === 'manager');
        }
        return res.status(200).json(rows);
      }

      if (req.query.evaluations === 'true') {
        const { data, error } = await supabase
          .from('evaluations')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) return dbError(res, error);
        const allRows = data || [];
        if (!viewerDept) {
          // No department on the account: only the viewer's own rows.
          return res.status(200).json(allRows.filter((row) => Number(row.employee_id) === Number(authUser.id)));
        }

        // Scope subjects by department + role chain:
        // - employee: only their own rows
        // - manager: own rows + own-dept employees
        // - admin: own rows + own-dept employees + own-dept managers
        const { data: people, error: peopleError } = await supabase
          .from('employees')
          .select('id, role, department');
        if (peopleError) return dbError(res, peopleError);

        const allowed = new Set([Number(authUser.id)]);
        (people || []).forEach((person) => {
          const dept = String(person.department || '');
          const role = String(person.role || '');
          if (dept !== viewerDept) return;
          if (authUser.role === 'manager' && role === 'employee') allowed.add(Number(person.id));
          if (authUser.role === 'admin' && (role === 'employee' || role === 'manager')) allowed.add(Number(person.id));
        });

        const scoped = allRows.filter((row) => allowed.has(Number(row.employee_id)));
        return res.status(200).json(scoped);
      }

      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Disabled Performance toggle stops ALL writes (incl. acknowledge).
      if (!(await requireFeature('performance', res))) return;

      if (body.action === 'template_save') {
        if (!assertAdminOrManager(authUser, res)) return;
        const name = cleanString(body.name);
        if (!name) return res.status(400).json({ error: 'Template name is required.' });

        const type = EVAL_TEMPLATE_TYPES.includes(body.type) ? body.type : EVAL_TEMPLATE_TYPES[0];
        const sections = sanitizeTemplateSections(body.sections);
        if (!sections.length) {
          return res.status(400).json({ error: 'Template must contain at least one named section with criteria.' });
        }

        const payload = {
          name,
          type,
          // Legacy column kept for compatibility; new flows ignore it.
          category: 'employee',
          // Department is FORCED to the creator's department.
          department: authUser.department || null,
          description: cleanString(body.description) || null,
          sections,
          status: body.status === 'inactive' ? 'inactive' : 'active',
          created_by_role: authUser.role,
          updated_at: new Date().toISOString(),
        };
        let query = body.id
          ? supabase.from('evaluation_templates').update(payload).eq('id', Number(body.id))
          : supabase.from('evaluation_templates').insert({ ...payload, created_by: authUser?.id || null, created_by_name: authUser?.name || null });
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({
          module: 'performance',
          action: body.id ? 'template_update' : 'template_create',
          record_id: data?.id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: data,
        });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'template_delete') {
        if (!assertAdminOrManager(authUser, res)) return;
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('evaluation_templates').select('*').eq('id', Number(body.id)).maybeSingle();
        if (!oldRow) return res.status(404).json({ error: 'Template not found.' });
        if (String(oldRow.department || '') !== String(authUser.department || '')) {
          return res.status(403).json({ error: 'You can only delete templates within your own department.' });
        }
        const { error } = await supabase.from('evaluation_templates').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({
          module: 'performance',
          action: 'template_delete',
          record_id: Number(body.id),
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'evaluation_save') {
        // Self-evaluation: the subject is always the signed-in user.
        const templateId = Number(body.template_id);
        if (!templateId || !cleanString(body.review_period)) {
          return res.status(400).json({ error: 'template_id and review_period are required.' });
        }

        const { data: template, error: templateError } = await supabase
          .from('evaluation_templates')
          .select('*')
          .eq('id', templateId)
          .maybeSingle();
        if (templateError) return dbError(res, templateError);
        if (!template) return res.status(404).json({ error: 'Evaluation template not found.' });
        if (String(template.status || '').toLowerCase() === 'inactive') {
          return res.status(403).json({ error: 'This evaluation template is inactive.' });
        }

        // Department gate — the form must belong to the viewer's department.
        if (String(template.department || '') !== String(authUser.department || '')) {
          return res.status(403).json({ error: 'This form belongs to another department.' });
        }

        // Answering chain: staff -> manager forms; managers/admins -> admin forms.
        const createdByRole = String(template.created_by_role || '');
        const neededRole = authUser.role === 'employee' ? 'manager' : 'admin';
        if (createdByRole !== neededRole) {
          return res.status(403).json({ error: 'You can only answer forms intended for your level.' });
        }

        // Completed evaluations are locked; only the owner may edit a draft.
        if (body.id) {
          const { data: existing } = await supabase.from('evaluations').select('*').eq('id', Number(body.id)).maybeSingle();
          if (!existing) return res.status(404).json({ error: 'Evaluation not found.' });
          if (Number(existing.employee_id) !== Number(authUser.id)) {
            return res.status(403).json({ error: 'You can only edit your own evaluation.' });
          }
          if (String(existing.status) === 'completed') {
            return res.status(409).json({ error: 'Completed evaluations cannot be changed.' });
          }
        }

        const scores = sanitizeEvaluationScores(body.scores, template.sections);
        const overallScore = computeOverallScore(scores, template.sections);
        const payload = {
          template_id: templateId,
          employee_id: authUser.id,
          evaluator_id: authUser.id,
          evaluator_name: authUser.name || null,
          evaluator_role: authUser.role,
          review_period: cleanString(body.review_period),
          scores,
          overall_score: overallScore,
          status: body.status === 'completed' ? 'completed' : 'draft',
          updated_at: new Date().toISOString(),
        };
        let query = body.id
          ? supabase.from('evaluations').update(payload).eq('id', Number(body.id))
          : supabase.from('evaluations').insert(payload);
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({
          module: 'performance',
          action: body.id ? 'evaluation_update' : 'evaluation_create',
          record_id: data?.id || null,
          employee_id: authUser.id,
          changed_by: authUser.id,
          changed_by_name: authUser.name || null,
          new_data: data,
        });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'evaluation_acknowledge') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.id) return res.status(400).json({ error: 'id and employee_id are required.' });
        const { data: existing } = await supabase.from('evaluations').select('*').eq('id', Number(body.id)).maybeSingle();
        if (!existing) return res.status(404).json({ error: 'Evaluation not found.' });
        if (Number(existing.employee_id) !== employeeId) {
          return res.status(403).json({ error: 'Employees can only acknowledge their own evaluations.' });
        }
        if (existing.employee_acknowledged) {
          return res.status(409).json({ error: 'This evaluation has already been acknowledged.' });
        }

        const { data, error } = await supabase
          .from('evaluations')
          .update({
            employee_acknowledged: true,
            employee_acknowledged_at: new Date().toISOString(),
            acknowledged_by: employeeId,
            acknowledged_by_name: body.employee_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', Number(body.id))
          .select()
          .single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({
          module: 'performance',
          action: 'evaluation_acknowledge',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: employeeId,
          changed_by_name: body.employee_name || null,
          new_data: data,
        });
        return res.status(200).json(data);
      }

      if (body.action === 'evaluation_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('evaluations').select('*').eq('id', Number(body.id)).maybeSingle();
        if (!oldRow) return res.status(404).json({ error: 'Evaluation not found.' });

        const isOwner = Number(oldRow.employee_id) === Number(authUser.id);
        const ownerDraft = isOwner && String(oldRow.status) !== 'completed';
        let adminWithinDept = false;
        if (!ownerDraft && authUser.role === 'admin') {
          const { data: subject } = await supabase
            .from('employees')
            .select('id, department')
            .eq('id', Number(oldRow.employee_id))
            .maybeSingle();
          adminWithinDept = String(subject?.department || '') === String(authUser.department || '');
        }
        if (!ownerDraft && !adminWithinDept) {
          return res.status(403).json({ error: 'You can only delete your own draft evaluations.' });
        }

        const { error } = await supabase.from('evaluations').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({
          module: 'performance',
          action: 'evaluation_delete',
          record_id: Number(body.id),
          employee_id: oldRow?.employee_id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Performance API error:', err);
    return dbError(res, err);
  }
}
