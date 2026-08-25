import { supabase } from '../../../lib/db-client.js';
import { requireAuth } from '../../../lib/requireAuth.js';
import { assertAdmin } from '../../../lib/authorize.js';
import { setCors } from '../../../lib/cors.js';
import { dbError } from '../../../lib/errors.js';
import { isFeatureEnabled } from '../../../lib/feature-flags.js';
import { safeInsertSystemAudit } from '../employees/index.js';
import { recordExists, cleanString } from './helpers.js';

async function getAdminConfig() {
  const { data, error } = await supabase
    .from('admin_configurations')
    .select('key, value')
    .in('key', ['document_required_types', 'profile_required_fields', 'expiry_alert_days', 'master_departments', 'master_locations']);

  if (error) return { document_required_types: [], profile_required_fields: [], expiry_alert_days: 90, master_departments: [], master_locations: [] };

  const config = { document_required_types: [], profile_required_fields: [], expiry_alert_days: 90, master_departments: [], master_locations: [] };
  (data || []).forEach((row) => { config[row.key] = row.value; });

  return {
    document_required_types: Array.isArray(config.document_required_types) ? config.document_required_types : [],
    profile_required_fields: Array.isArray(config.profile_required_fields) ? config.profile_required_fields : [],
    expiry_alert_days: Number(config.expiry_alert_days || 90),
    master_departments: Array.isArray(config.master_departments) ? config.master_departments : [],
    master_locations: Array.isArray(config.master_locations) ? config.master_locations : [],
  };
}

async function buildDocumentChecklist() {
  const config = await getAdminConfig();
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('*')
    .neq('status', 'inactive')
    .order('name', { ascending: true });
  if (empError) throw empError;

  const { data: documents, error: docError } = await supabase
    .from('employee_documents')
    .select('employee_id, document_type');
  if (docError) throw docError;

  const docMap = new Map();
  (documents || []).forEach((doc) => {
    const employeeId = Number(doc.employee_id);
    if (!docMap.has(employeeId)) docMap.set(employeeId, new Set());
    docMap.get(employeeId).add(cleanString(doc.document_type));
  });

  return (employees || []).map((employee) => {
    const ownedDocs = docMap.get(Number(employee.id)) || new Set();
    const missingDocuments = config.document_required_types.filter((type) => !ownedDocs.has(type));
    const missingProfileFields = config.profile_required_fields.filter((field) => {
      const value = employee[field];
      return value === null || value === undefined || String(value).trim() === '';
    });
    return { employee_id: employee.id, employee_name: employee.name, department: employee.department, missing_documents: missingDocuments, missing_profile_fields: missingProfileFields, total_missing: missingDocuments.length + missingProfileFields.length };
  });
}

function daysUntilDate(dateValue) {
  if (!dateValue) return null;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

async function buildReminderResults() {
  const [rulesResult, checklist, employeeResult] = await Promise.all([
    supabase.from('reminder_rules').select('*').eq('enabled', true),
    buildDocumentChecklist(),
    supabase.from('employees').select('*').neq('status', 'inactive'),
  ]);
  if (rulesResult.error) throw rulesResult.error;
  if (employeeResult.error) throw employeeResult.error;

  const rules = rulesResult.data || [];
  const employees = employeeResult.data || [];
  const results = [];

  for (const rule of rules) {
    if (rule.reminder_type === 'expiry') {
      employees.forEach((employee) => {
        [['Probation End', employee.probation_end_date], ['Contract End', employee.contract_end_date], ['Work Permit Expiry', employee.work_permit_expiry], ['Passport Expiry', employee.passport_expiry], ['Driving License Expiry', employee.driving_license_expiry], ['Medical Checkup Expiry', employee.medical_checkup_expiry]].forEach(([label, date]) => {
          const days = daysUntilDate(date);
          if (days !== null && days <= Number(rule.days_before) && days >= -30) {
            results.push({ rule_id: rule.id, reminder_type: 'expiry', employee_id: employee.id, employee_name: employee.name, title: `${label}: ${employee.name}`, message: days < 0 ? `${label} expired ${Math.abs(days)} day(s) ago on ${date}.` : `${label} will expire in ${days} day(s) on ${date}.` });
          }
        });
      });
    }

    if (rule.reminder_type === 'missing_documents') {
      checklist.filter((row) => row.missing_documents.length > 0).forEach((row) => {
        results.push({ rule_id: rule.id, reminder_type: 'missing_documents', employee_id: row.employee_id, employee_name: row.employee_name, title: `Missing documents: ${row.employee_name}`, message: row.missing_documents.join(', ') });
      });
    }

    if (rule.reminder_type === 'missing_profile') {
      checklist.filter((row) => row.missing_profile_fields.length > 0).forEach((row) => {
        results.push({ rule_id: rule.id, reminder_type: 'missing_profile', employee_id: row.employee_id, employee_name: row.employee_name, title: `Missing profile info: ${row.employee_name}`, message: row.missing_profile_fields.join(', ') });
      });
    }

    if (rule.reminder_type === 'pending_approvals') {
      const [leavePending, profilePending, correctionPending] = await Promise.all([
        supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('employee_profile_update_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('attendance_correction_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      const lp = leavePending.count || 0;
      const pp = profilePending.count || 0;
      const cp = correctionPending.count || 0;
      if (lp || pp || cp) {
        results.push({ rule_id: rule.id, reminder_type: 'pending_approvals', employee_id: null, employee_name: null, title: 'Pending approvals summary', message: `Leave: ${lp}, Profile Updates: ${pp}, Attendance Corrections: ${cp}` });
      }
    }
  }

  return results;
}

async function runReminderWorkflow({ sendEmail = true, generatedBy = null, generatedByName = null, source = 'manual' } = {}) {
  const results = await buildReminderResults();

  if (results.length > 0) {
    await supabase.from('reminder_logs').insert(
      results.map((item) => ({
        rule_id: item.rule_id || null,
        reminder_type: item.reminder_type,
        employee_id: item.employee_id || null,
        title: item.title,
        message: item.message,
        status: sendEmail ? 'generated_email_pending' : 'generated',
        generated_by: generatedBy,
        generated_by_name: generatedByName || source,
      }))
    );
  }

  let emailResult = null;
  if (sendEmail) {
    // Email sending logic would go here
  }

  await safeInsertSystemAudit({
    module: 'reminders',
    action: source === 'vercel_cron' ? 'cron_run_reminders' : 'run_reminders',
    changed_by: generatedBy,
    changed_by_name: generatedByName || source,
    new_data: { count: results.length, email: emailResult, source },
  });

  return { results, email: emailResult };
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  let authUser = null;
  if (req.query?.cron_reminders !== '1') {
    authUser = await requireAuth(req, res);
    if (!authUser) return;
  }

  try {
    if (req.method === 'GET') {
      if (req.query.cron_reminders === '1') {
        const expectedSecret = process.env.CRON_SECRET;
        const authHeader = req.headers.authorization || '';
        const isVercelCron = req.headers['x-vercel-cron'] === '1';
        if (!isVercelCron && !(expectedSecret && authHeader === `Bearer ${expectedSecret}`)) {
          return res.status(401).json({ error: 'Unauthorized cron request.' });
        }
        if (!(await isFeatureEnabled('reminder_scheduler'))) {
          return res.status(403).json({ ok: false, error: 'Reminder Scheduler is currently disabled by Admin.' });
        }
        const result = await runReminderWorkflow({ sendEmail: true, generatedBy: null, generatedByName: 'Vercel Cron', source: 'vercel_cron' });
        return res.status(200).json({ ok: true, count: result.results.length, email: result.email });
      }

      if (req.query.reminder_rules === 'true') {
        const { data, error } = await supabase.from('reminder_rules').select('*').order('created_at', { ascending: false });
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }

      if (req.query.reminder_logs === 'true') {
        const { data, error } = await supabase.from('reminder_logs').select('*').order('created_at', { ascending: false }).limit(500);
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }

      if (req.query.document_checklist === 'true') {
        const checklist = await buildDocumentChecklist();
        return res.status(200).json(checklist);
      }

      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      if (!authUser || !(await assertAdmin(authUser, res))) return;

      const body = req.body || {};

      if (body.action === 'reminder_rule_save') {
        const payload = { name: cleanString(body.name), reminder_type: body.reminder_type || 'expiry', days_before: Number(body.days_before || 0), enabled: body.enabled !== false, updated_at: new Date().toISOString() };
        if (!payload.name) return res.status(400).json({ error: 'Reminder rule name is required.' });
        if (await recordExists('reminder_rules', [['name', payload.name, 'ilike']], body.id)) {
          return res.status(409).json({ error: 'A reminder rule with this name already exists.' });
        }

        let query = body.id ? supabase.from('reminder_rules').update(payload).eq('id', Number(body.id)) : supabase.from('reminder_rules').insert({ ...payload, created_by: authUser?.id || null, created_by_name: authUser?.name || null });
        const { data, error } = await query.select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'reminders', action: body.id ? 'rule_update' : 'rule_create', record_id: data?.id || null, changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, new_data: data });
        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'reminder_rule_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('reminder_rules').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('reminder_rules').delete().eq('id', Number(body.id));
        if (error) return dbError(res, error);
        await safeInsertSystemAudit({ module: 'reminders', action: 'rule_delete', record_id: Number(body.id), changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, old_data: oldRow });
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'run_reminders') {
        if (!(await isFeatureEnabled('reminder_scheduler'))) {
          return res.status(403).json({ error: 'Reminder Scheduler is currently disabled by Admin.' });
        }
        const result = await runReminderWorkflow({ sendEmail: body.send_email !== false, generatedBy: authUser?.id || null, generatedByName: authUser?.name || null, source: 'manual' });
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Reminders API error:', err);
    return dbError(res, err);
  }
}
