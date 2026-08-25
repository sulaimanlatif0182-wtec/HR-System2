import { supabase } from '../../../lib/db-client.js';
import { requireAuth } from '../../../lib/requireAuth.js';
import { assertAdmin } from '../../../lib/authorize.js';
import { setCors } from '../../../lib/cors.js';
import { dbError } from '../../../lib/errors.js';
import { safeInsertSystemAudit } from '../employees/index.js';
import { countRows, sumRows } from './helpers.js';
import { getPeriodRange, DEFAULT_ADMIN_CONFIG } from '../../../lib/employeeLogic.js';

async function checkTableHealth(table, buildQuery) {
  try {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (buildQuery) query = buildQuery(query);
    const { count, error } = await query;
    return { ok: !error, count: count || 0, error: error?.message || null };
  } catch (err) {
    return { ok: false, count: 0, error: err?.message || String(err) };
  }
}

async function buildSystemHealth() {
  const checks = await Promise.all([
    checkTableHealth('employees'),
    checkTableHealth('attendance'),
    checkTableHealth('leave_requests'),
    checkTableHealth('claims'),
    checkTableHealth('payroll'),
    checkTableHealth('company_announcements'),
    checkTableHealth('reminder_rules'),
    checkTableHealth('reminder_logs'),
    checkTableHealth('system_audit_logs'),
    checkTableHealth('employee_documents'),
  ]);

  const tableNames = ['employees', 'attendance', 'leave_requests', 'claims', 'payroll', 'company_announcements', 'reminder_rules', 'reminder_logs', 'system_audit_logs', 'employee_documents'];

  let storageBuckets = [];
  let storageError = null;
  try {
    const { data, error } = await supabase.storage.listBuckets();
    storageBuckets = (data || []).map((bucket) => ({ name: bucket.name, public: bucket.public }));
    storageError = error?.message || null;
  } catch (err) {
    storageError = err?.message || String(err);
  }

  const { data: lastReminderLogs } = await supabase.from('reminder_logs').select('*').order('created_at', { ascending: false }).limit(5);

  return {
    ok: checks.every((item) => item.ok),
    checked_at: new Date().toISOString(),
    app: { app_base_url: process.env.APP_BASE_URL || 'https://hr-system2.vercel.app', node_env: process.env.NODE_ENV || null, cron_path: '/api/employees?cron_reminders=1', cron_schedule: '0 1 * * * UTC / 09:00 Malaysia time' },
    environment: { supabase_url: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL), supabase_service_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY), smtp_host: Boolean(process.env.SMTP_HOST), smtp_user: Boolean(process.env.SMTP_USER), smtp_password: Boolean(process.env.SMTP_PASSWORD), smtp_from: Boolean(process.env.SMTP_FROM), app_base_url: Boolean(process.env.APP_BASE_URL), cron_secret: Boolean(process.env.CRON_SECRET) },
    tables: Object.fromEntries(tableNames.map((name, index) => [name, checks[index]])),
    storage: { ok: !storageError, error: storageError, buckets: storageBuckets, required_buckets: ['employee-documents', 'leave-attachments', 'claim-attachments'].map((name) => ({ name, exists: storageBuckets.some((bucket) => bucket.name === name) })) },
    reminders: { last_logs: lastReminderLogs || [] },
  };
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  let authUser = null;
  if (req.query?.system_health === 'true') {
    authUser = await requireAuth(req, res);
    if (!authUser) return;
    if (!assertAdmin(authUser, res)) return;
  }

  try {
    if (req.method === 'GET') {
      if (req.query.system_health === 'true') {
        const health = await buildSystemHealth();
        return res.status(200).json(health);
      }

      if (req.query.monthly_hr_report === 'true') {
        if (!authUser || !assertAdmin(authUser, res)) return;
        const report = await buildMonthlyHrReport(req.query.period);
        return res.status(200).json(report);
      }

      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      if (!assertAdmin(authUser, res)) return;

      const body = req.body || {};

      if (body.action === 'system_maintenance') {
        const { data: summary, error: rpcError } = await supabase.rpc('run_system_maintenance');
        if (rpcError) return res.status(400).json({ error: `Maintenance failed: ${rpcError.message}` });

        const requiredBuckets = ['employee-documents', 'leave-attachments', 'claim-attachments'];
        const bucketsCreated = [];
        const bucketErrors = [];

        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          const existing = new Set((buckets || []).map((bucket) => bucket.name));
          for (const name of requiredBuckets) {
            if (existing.has(name)) continue;
            const { error: createError } = await supabase.storage.createBucket(name, { public: false });
            if (createError) bucketErrors.push(`${name}: ${createError.message}`);
            else bucketsCreated.push(name);
          }
        } catch (err) {
          bucketErrors.push(err?.message || String(err));
        }

        let requiredBucketStatus = [];
        try {
          const { data: bucketsAfter } = await supabase.storage.listBuckets();
          const current = new Set((bucketsAfter || []).map((bucket) => bucket.name));
          requiredBucketStatus = requiredBuckets.map((name) => ({ name, exists: current.has(name) }));
        } catch (err) {
          requiredBucketStatus = requiredBuckets.map((name) => ({ name, exists: false }));
        }

        const envChecks = { SUPABASE_URL: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY), SMTP_HOST: Boolean(process.env.SMTP_HOST), SMTP_USER: Boolean(process.env.SMTP_USER), SMTP_PASSWORD: Boolean(process.env.SMTP_PASSWORD), SMTP_FROM: Boolean(process.env.SMTP_FROM), APP_BASE_URL: Boolean(process.env.APP_BASE_URL), CRON_SECRET: Boolean(process.env.CRON_SECRET) };
        const missingEnv = Object.keys(envChecks).filter((key) => !envChecks[key]);
        const manualActions = missingEnv.map((key) => {
          if (key === 'CRON_SECRET') return 'Add CRON_SECRET to Vercel environment variables, then redeploy.';
          if (key.startsWith('SMTP')) return 'Add SMTP_* environment variables in Vercel for email sending.';
          return `Add ${key} to Vercel environment variables.`;
        });

        const result = { analyzed_tables: Array.isArray(summary?.analyzed_tables) ? summary.analyzed_tables : [], pruned_reminders: Number(summary?.pruned_reminders || 0), buckets_created: bucketsCreated, bucket_errors: bucketErrors, storage: { required_buckets: requiredBucketStatus }, environment: { missing_env_vars: missingEnv, manual_actions: manualActions }, ran_at: summary?.ran_at || new Date().toISOString() };

        await safeInsertSystemAudit({ module: 'system', action: 'system_maintenance', record_id: 'system', changed_by: authUser?.id || null, changed_by_name: authUser?.name || null, new_data: result });

        return res.status(200).json({ success: true, summary: result });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('System Health API error:', err);
    return dbError(res, err);
  }
}

async function buildMonthlyHrReport(period) {
  const range = getPeriodRange(period);
  const [totalEmployees, activeEmployees, newJoiners, attendanceRows, lateCount, leavePending, leaveApproved, claimsPending, claimsApprovedAmount, payrollNet, holidays, correctionsPending] = await Promise.all([
    countRows('employees'),
    countRows('employees', (q) => q.neq('status', 'inactive')),
    countRows('employees', (q) => q.gte('join_date', range.startDate).lte('join_date', range.endDate)),
    countRows('attendance', (q) => q.gte('date', range.startDate).lte('date', range.endDate)),
    countRows('attendance', (q) => q.gte('date', range.startDate).lte('date', range.endDate).eq('status', 'late')),
    countRows('leave_requests', (q) => q.eq('status', 'pending')),
    countRows('leave_requests', (q) => q.eq('status', 'approved').lte('start_date', range.endDate).gte('end_date', range.startDate)),
    countRows('claims', (q) => q.not('status', 'in', '(approved,rejected,cancelled,paid)')),
    sumRows('claims', 'amount', (q) => q.eq('status', 'approved').gte('claim_date', range.startDate).lte('claim_date', range.endDate)),
    sumRows('payroll', 'net_pay', (q) => q.eq('period', range.period)),
    supabase.from('company_holidays').select('*').gte('holiday_date', range.startDate).lte('holiday_date', range.endDate).then(({ data }) => data || []),
    countRows('attendance_correction_requests', (q) => q.eq('status', 'pending')),
  ]);

  return { period: range.period, start_date: range.startDate, end_date: range.endDate, generated_at: new Date().toISOString(), employees: { total: totalEmployees, active: activeEmployees, new_joiners: newJoiners }, attendance: { records: attendanceRows, late_count: lateCount, pending_corrections: correctionsPending }, leave: { pending: leavePending, approved_in_period: leaveApproved }, claims: { pending: claimsPending, approved_amount: Math.round(claimsApprovedAmount * 100) / 100 }, payroll: { total_net_pay: Math.round(payrollNet * 100) / 100 }, holidays };
}
