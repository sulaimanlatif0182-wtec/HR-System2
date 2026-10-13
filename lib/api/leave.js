import { supabase } from '../db-client.js';
import { isFeatureEnabled, requireFeature } from '../feature-flags.js';
import { requireAuth } from '../requireAuth.js';
import { setCors } from '../cors.js';
import { dbError } from '../errors.js';
import {
  notifyLeaveSubmittedToApproverSafe,
  notifyLeaveApprovedToPeers,
  notifyLeaveCancelRequested,
  notifyLeaveCancelApprovedToPeers,
  notifyLeaveDecision,
} from '../../server/notify.js';
import { parseLeaveRequest } from '../validators.js';
import {
  dateKey,
  countWorkingLeaveDays,
  calculateTimeOffHours,
  computeLeaveBalance,
  deductBucketFor,
} from '../leaveMath.js';

const BALANCE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Unpaid Leave',
  'Maternity/Paternity',
  'Other Leave',
];
// Note: 'EL (Annual Leave)' / 'EL (Unpaid Leave)' are valid submit types but
// NOT balance buckets (they deduct from Annual / Unpaid). They are resolved
// via deductBucketFor, never listed here.

const BACKDATE_ALLOWED_LEAVE_TYPES = new Set([
  'Unpaid Leave',
  'Sick Leave',
  'Maternity/Paternity',
  'EL',
  'EL (Annual Leave)',
  'EL (Unpaid Leave)',
]);

const ATTACHMENT_REQUIRED_LEAVE_TYPES = new Set([
  'Sick Leave',
  'Maternity/Paternity',
  'EL',
  'EL (Annual Leave)',
  'EL (Unpaid Leave)',
]);

function normalizeLeaveType(value) {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function todayMalaysia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

async function getCompanyHolidayMap(startDate, endDate) {
  const { data, error } = await supabase
    .from('company_holidays')
    .select('holiday_date, name, type, is_working_day')
    .gte('holiday_date', startDate)
    .lte('holiday_date', endDate);

  if (error) {
    // If table is not created yet, do not block leave submission.
    return {};
  }

  const map = {};

  (data || []).forEach((holiday) => {
    map[holiday.holiday_date] = holiday;
  });

  return map;
}

async function safeNotify(fn, payload) {
  try {
    await fn(payload);
  } catch (err) {
    console.error('Notification error:', err instanceof Error ? err.message : err);
  }
}

async function safeInsertSystemAudit(payload) {
  try {
    await supabase.from('system_audit_logs').insert({
      module: payload.module || 'general',
      action: payload.action || 'unknown',
      record_id: payload.record_id || null,
      employee_id: payload.employee_id || null,
      changed_by: payload.changed_by || null,
      changed_by_name: payload.changed_by_name || null,
      old_data: payload.old_data || null,
      new_data: payload.new_data || null,
      reason: payload.reason || null,
    });
  } catch (err) {
    console.error('System audit insert failed:', err?.message || err);
  }
}

async function getEmployee(employeeId) {
  if (!employeeId) return null;

  const { data, error } = await supabase
    .from('employees')
    .select('id, name, email, role, department, title, status, supervisor_id')
    .eq('id', employeeId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

async function findOverlappingLeave({ employeeId, startDate, endDate, requestMode }) {
  let query = supabase
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date, status')
    .eq('employee_id', Number(employeeId))
    .in('status', ['pending', 'approved'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .limit(1);

  if (requestMode) query = query.eq('request_mode', requestMode);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;

  return data || null;
}

async function getApprovedUsedDays(employeeId, leaveType) {
  // Counts approved rows whose days deduct from the given bucket. Matching
  // runs in JS (not a PostgREST OR filter) because bucket names contain
  // characters that break query parsing.
  const bucket = deductBucketFor(leaveType);
  const { data, error } = await supabase
    .from('leave_requests')
    .select('leave_type, deduct_bucket, days')
    .eq('employee_id', employeeId)
    .eq('status', 'approved');

  if (error) throw error;

  return (data || []).reduce((sum, row) => {
    const rowBucket = row.deduct_bucket || row.leave_type;
    return rowBucket === bucket ? sum + Number(row.days || 0) : sum;
  }, 0);
}

async function getAdjustmentDays(employeeId, leaveType) {
  const { data, error } = await supabase
    .from('leave_adjustments')
    .select('adjustment_days')
    .eq('employee_id', employeeId)
    .eq('leave_type', leaveType);

  if (error) throw error;

  return (data || []).reduce(
    (sum, row) => sum + Number(row.adjustment_days || 0),
    0
  );
}

async function getBalanceDetail(employeeId, leaveType) {
  const { data: balance, error } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('leave_type', leaveType)
    .maybeSingle();

  if (error) throw error;

  const entitlementDays = Number(balance?.entitlement_days || 0);
  const usedDays = await getApprovedUsedDays(employeeId, leaveType);
  const adjustmentDays = await getAdjustmentDays(employeeId, leaveType);

  return {
    id: balance?.id ?? null,
    employee_id: employeeId,
    leave_type: leaveType,
    entitlement_days: entitlementDays,
    adjustment_days: adjustmentDays,
    used_days: usedDays,
    balance_days: computeLeaveBalance({
      entitlementDays,
      adjustmentDays,
      usedDays,
    }),
  };
}

async function getBalances(employeeId) {
  if (!employeeId) return [];

  const rows = [];

  for (const leaveType of BALANCE_TYPES) {
    rows.push(await getBalanceDetail(employeeId, leaveType));
  }

  return rows;
}

async function getAdjustments(employeeId) {
  if (!employeeId) return [];

  let query = supabase
    .from('leave_adjustments')
    .select('*')
    .order('created_at', { ascending: false });

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data || [];
}

async function getBalanceHistory(employeeId) {
  if (!employeeId) return [];

  const { data, error } = await supabase
    .from('leave_balance_audit_logs')
    .select(
      'id, employee_id, leave_type, changed_by, changed_by_name, old_entitlement, new_entitlement, old_used, new_used, old_balance, new_balance, adjustment_days, reason, created_at'
    )
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return [];

  return data || [];
}

async function insertBalanceAudit({
  employeeId,
  leaveType,
  changedBy,
  changedByName,
  oldBalance,
  newBalance,
  adjustmentDays = 0,
  reason,
}) {
  const { error } = await supabase.from('leave_balance_audit_logs').insert({
    employee_id: Number(employeeId),
    leave_type: leaveType,
    changed_by: changedBy || null,
    changed_by_name: changedByName || null,
    old_entitlement: oldBalance.entitlement_days,
    new_entitlement: newBalance.entitlement_days,
    old_used: oldBalance.used_days,
    new_used: newBalance.used_days,
    old_balance: oldBalance.balance_days,
    new_balance: newBalance.balance_days,
    adjustment_days: adjustmentDays,
    reason: reason || null,
  });

  if (error) throw error;
}

export default async function handler(req, res) {
  setCors(res, req);
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    // =========================
    // GET LEAVE REQUESTS / BALANCES / ADJUSTMENTS
    // =========================
    if (req.method === 'GET') {
      // Signed URL for a private leave attachment (mirrors documents.js).
      if (req.query.leave_attachment_url === 'true') {
        const leaveId = Number(req.query.leave_id);
        if (!leaveId) {
          return res.status(400).json({ error: 'leave_id is required.' });
        }
        const { data: row, error } = await supabase
          .from('leave_requests')
          .select('id, employee_id, attachment_path, attachment_url')
          .eq('id', leaveId)
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!row) return res.status(404).json({ error: 'Leave request not found.' });
        const role = authUser?.role || 'employee';
        const isOwner = Number(row.employee_id) === Number(authUser.id);
        let isSupervisor = false;
        if (!isOwner && role !== 'admin' && role !== 'manager') {
          const applicant = await getEmployee(Number(row.employee_id));
          isSupervisor = !!applicant && Number(applicant.supervisor_id) === Number(authUser.id);
        }
        if (!(role === 'admin' || role === 'manager' || isOwner || isSupervisor)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (!row.attachment_path) {
          if (row.attachment_url) {
            return res.status(200).json({ signedUrl: row.attachment_url, expiresIn: null, legacyPublicUrl: true });
          }
          return res.status(400).json({ error: 'No attachment file for this request.' });
        }
        const expiresIn = 600;
        const { data: signedData, error: signedError } = await supabase.storage
          .from('leave-attachments')
          .createSignedUrl(row.attachment_path, expiresIn);
        if (signedError) return res.status(500).json({ error: signedError.message });
        return res.status(200).json({ signedUrl: signedData?.signedUrl, expiresIn });
      }

      const { employee_id, status, balances, adjustments, balance_history } = req.query;

      if (balances === 'true') {
        // Workers may only view their own balances.
        const targetId =
          authUser.category === 'worker' ? authUser.id : Number(employee_id);

        if (!targetId) {
          return res.status(400).json({
            error: 'employee_id is required for balances.',
          });
        }

        const data = await getBalances(targetId);

        return res.status(200).json(data);
      }

      if (adjustments === 'true') {
        // Workers may only view their own adjustments.
        const targetId =
          authUser.category === 'worker' ? authUser.id : Number(employee_id);

        if (!targetId) {
          return res.status(400).json({
            error: 'employee_id is required for adjustments.',
          });
        }

        const data = await getAdjustments(targetId);

        return res.status(200).json(data);
      }

      if (balance_history === 'true') {
        // Workers may only view their own balance history.
        const targetId =
          authUser.category === 'worker' ? authUser.id : Number(employee_id);

        if (!targetId) {
          return res.status(400).json({
            error: 'employee_id is required for balance_history.',
          });
        }

        const data = await getBalanceHistory(Number(targetId));

        return res.status(200).json(data);
      }

      let query = supabase
        .from('leave_requests')
        .select('*')
        .order('requested_at', { ascending: false });

      // Workers only ever see their own leave records.
      if (authUser.category === 'worker') query = query.eq('employee_id', authUser.id);
      if (employee_id && authUser.category !== 'worker') query = query.eq('employee_id', employee_id);
      if (status) query = query.eq('status', status);
      // Dashboard view: every request still awaiting a decision, in one call.
      // Includes cancellation requests so approvers see them.
      if (req.query?.pending === 'true') {
        query = query.in('status', ['pending', 'pending_supervisor', 'pending_manager', 'pending_cancel']);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Privacy: applications are visible to the approval chain only.
      // Regular employees see their own requests (any status), their direct
      // reports (for supervisor duty), and co-workers' requests ONLY once
      // approved (others are notified on approval, never on reject).
      // Other Leave is stricter: co-workers never see it, even approved —
      // only the applicant, managers and admins.
      const role = authUser?.role || 'employee';
      const isPrivileged =
        authUser.category === 'worker'
          ? true
          : role === 'admin' || role === 'manager';

      if (!isPrivileged) {
        let supervisedIds = [];

        try {
          const { data: reports, error: reportsError } = await supabase
            .from('employees')
            .select('id')
            .eq('supervisor_id', authUser.id);

          if (reportsError) throw reportsError;

          supervisedIds = (reports || []).map((r) => Number(r.id));
        } catch {
          supervisedIds = [];
        }

        const filtered = (data || []).filter((row) => {
          if (Number(row.employee_id) === Number(authUser.id)) return true;
          if (row.leave_type === 'Other Leave') return false;
          if (supervisedIds.includes(Number(row.employee_id))) return true;
          return row.status === 'approved';
        });

        return res.status(200).json(filtered);
      }

      return res.status(200).json(data || []);
    }

    // =========================
    // POST: CREATE LEAVE / UPDATE ENTITLEMENT / ADD ADJUSTMENT
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // =========================
      // UPDATE ENTITLEMENT
      // =========================
      if (action === 'update_entitlement') {
        if (!(await requireFeature('leave_approval', res))) return;
        const {
          employee_id,
          leave_type,
          entitlement_days,
          changed_by,
          changed_by_name,
          reason,
        } = body;

        if (!employee_id || !leave_type) {
          return res.status(400).json({
            error: 'employee_id and leave_type are required.',
          });
        }

        if (!reason || !String(reason).trim()) {
          return res.status(400).json({
            error: 'Reason is required.',
          });
        }

        const leaveType = normalizeLeaveType(leave_type);

        if (!BALANCE_TYPES.includes(leaveType)) {
          return res.status(400).json({
            error: 'Invalid leave type.',
          });
        }

        const oldBalance = await getBalanceDetail(Number(employee_id), leaveType);

        const { error } = await supabase.from('leave_balances').upsert(
          {
            employee_id: Number(employee_id),
            leave_type: leaveType,
            entitlement_days: toNumber(entitlement_days),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'employee_id,leave_type',
          }
        );

        if (error) throw error;

        const newBalance = await getBalanceDetail(Number(employee_id), leaveType);

        await insertBalanceAudit({
          employeeId: Number(employee_id),
          leaveType,
          changedBy: changed_by,
          changedByName: changed_by_name,
          oldBalance,
          newBalance,
          adjustmentDays: 0,
          reason,
        });

        return res.status(200).json(newBalance);
      }

      // =========================
      // ADD ADJUSTMENT
      // =========================
      if (action === 'add_adjustment') {
        if (!(await requireFeature('leave_approval', res))) return;
        const {
          employee_id,
          leave_type,
          adjustment_days,
          reason,
          created_by,
          created_by_name,
        } = body;

        if (!employee_id || !leave_type) {
          return res.status(400).json({
            error: 'employee_id and leave_type are required.',
          });
        }

        if (!reason || !String(reason).trim()) {
          return res.status(400).json({
            error: 'Reason is required.',
          });
        }

        const adjustmentDays = toNumber(adjustment_days);

        if (adjustmentDays === 0) {
          return res.status(400).json({
            error: 'Adjustment days cannot be 0.',
          });
        }

        const leaveType = normalizeLeaveType(leave_type);

        if (!BALANCE_TYPES.includes(leaveType)) {
          return res.status(400).json({
            error: 'Invalid leave type.',
          });
        }

      const oldBalance = await getBalanceDetail(Number(employee_id), leaveType);

      // Unpaid Leave can never hold a positive balance.
      if (
        leaveType === 'Unpaid Leave' &&
        Number(oldBalance.balance_days || 0) + adjustmentDays > 0
      ) {
        return res.status(400).json({
          error: 'Unpaid Leave balance cannot be positive.',
        });
      }

      const { data: adjustment, error } = await supabase
        .from('leave_adjustments')
        .insert({
            employee_id: Number(employee_id),
            leave_type: leaveType,
            adjustment_days: adjustmentDays,
            reason: String(reason).trim(),
            created_by: created_by || null,
            created_by_name: created_by_name || null,
          })
          .select()
          .single();

        if (error) throw error;

        const newBalance = await getBalanceDetail(Number(employee_id), leaveType);

        await insertBalanceAudit({
          employeeId: Number(employee_id),
          leaveType,
          changedBy: created_by,
          changedByName: created_by_name,
          oldBalance,
          newBalance,
          adjustmentDays,
          reason,
        });

        return res.status(201).json({
          adjustment,
          balance: newBalance,
        });
      }

      // =========================
      // CREATE LEAVE REQUEST
      // =========================
      if (!(await isFeatureEnabled('leave_request'))) {
        return res.status(403).json({
          error: 'Leave request submission is currently disabled.',
        });
      }

      const parsed = parseLeaveRequest(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error });
      }

      let leaveType = normalizeLeaveType(body.leave_type);
      const requestMode = body.request_mode || 'leave';
      const today = todayMalaysia();

      // Plain EL was retired: staff must pick EL (Annual Leave) or
      // EL (Unpaid Leave). Checked before anything else so the message
      // is clear even without an attachment.
      if (requestMode === 'leave' && leaveType === 'EL') {
        return res.status(400).json({
          error:
            'EL was replaced by EL (Annual Leave) and EL (Unpaid Leave). Please resubmit with one of them.',
        });
      }

      if (!body.employee_id) {
        return res.status(400).json({
          error: 'Employee is required.',
        });
      }

      if (!leaveType) {
        return res.status(400).json({
          error: 'Leave type is required.',
        });
      }

      if (!body.reason || !String(body.reason).trim()) {
        return res.status(400).json({
          error: 'Reason is required.',
        });
      }

      if (!body.duties_covered_by || !String(body.duties_covered_by).trim()) {
        return res.status(400).json({
          error: 'Duties covered by is required.',
        });
      }

      if (!body.employee_acknowledged) {
        return res.status(400).json({
          error: 'Employee acknowledgement is required.',
        });
      }

      if (
        requestMode === 'leave' &&
        ATTACHMENT_REQUIRED_LEAVE_TYPES.has(leaveType) &&
        !body.attachment_url &&
        !body.attachment_path
      ) {
        return res.status(400).json({
          error: `${leaveType} requires an attachment.`,
        });
      }

      const employee = await getEmployee(Number(body.employee_id));

      if (!employee) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      // Staff rules: Annual Leave needs 3-day notice. A late Annual request
      // is only accepted with explicit confirmation and is recorded as
      // EL (Annual Leave) so the deduction still hits the Annual bucket.
      let lateAnnualConfirmed = false;
      if (requestMode === 'leave' && leaveType === 'Annual Leave') {
        const minStart = new Date(
          new Date(`${today}T00:00:00Z`).getTime() + 3 * 86400000
        )
          .toISOString()
          .slice(0, 10);
        if (body.start_date && body.start_date < minStart) {
          if (body.confirmed_late_el !== true) {
            return res.status(400).json({
              error:
                'Annual Leave must be applied at least 3 days in advance. Confirm to submit it as EL (Annual Leave) instead.',
              code: 'CONFIRM_LATE_EL',
            });
          }
          lateAnnualConfirmed = true;
        }
      }

      // Leave approval flow: if the applicant has a supervisor (Working with),
      // that supervisor's decision is final regardless of anyone's role.
      // Applicants without a supervisor follow the manager/admin chain.
      const initialStatus = employee.supervisor_id
        ? 'pending_supervisor'
        : 'pending_manager';

      const payload = {
        employee_id: Number(body.employee_id),
        leave_type: leaveType,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        days: toNumber(body.days, 0),
        status: initialStatus,
        reason: String(body.reason).trim(),
        decided_by: null,
        decided_role: null,
        decided_at: null,
        half_day_period: body.half_day_period || 'Full Day',
        duties_covered_by: String(body.duties_covered_by).trim(),
        attachment_url: body.attachment_url || null,
        attachment_name: body.attachment_name || null,
        attachment_path: body.attachment_path || null,
        employee_acknowledged: Boolean(body.employee_acknowledged),
        manager_remarks: body.manager_remarks || null,
        admin_remarks: body.admin_remarks || null,
        office_remarks: body.office_remarks || null,
        request_mode: requestMode,
        time_off_date: body.time_off_date || null,
        time_off_period: body.time_off_period || null,
        time_off_start: body.time_off_start || null,
        time_off_end: body.time_off_end || null,
        time_off_hours: 0,
        submitted_by: body.submitted_by || null,
        submitted_by_name: body.submitted_by_name || null,
        submitted_for_employee: Boolean(body.submitted_for_employee),
      };

      if (requestMode === 'time_off') {
        if (!body.time_off_date || !body.time_off_start || !body.time_off_end) {
          return res.status(400).json({
            error: 'Time off date, start time and end time are required.',
          });
        }

        if (body.time_off_date < today) {
          return res.status(400).json({
            error: 'Time Off cannot be submitted for a past date.',
          });
        }

        const hours = calculateTimeOffHours(
          body.time_off_start,
          body.time_off_end
        );

        if (hours <= 0) {
          return res.status(400).json({
            error: 'Time off end time must be later than start time.',
          });
        }

        if (hours > 2) {
          return res.status(400).json({
            error: 'Time off cannot exceed 2 hours.',
          });
        }

        payload.days = 0;
        payload.start_date = body.time_off_date;
        payload.end_date = body.time_off_date;
        payload.time_off_hours = hours;
      } else {
        if (!body.start_date || !body.end_date) {
          return res.status(400).json({
            error: 'Start date and end date are required.',
          });
        }

        if (
          !BACKDATE_ALLOWED_LEAVE_TYPES.has(leaveType) &&
          body.start_date < today
        ) {
          return res.status(400).json({
            error: 'This leave type cannot be submitted for a past date.',
          });
        }

        if (new Date(body.end_date) < new Date(body.start_date)) {
          return res.status(400).json({
            error: 'End date cannot be earlier than start date.',
          });
        }

        if (body.half_day_period === 'AM' || body.half_day_period === 'PM') {
          payload.days = 0.5;
        } else {
          const holidayMap = await getCompanyHolidayMap(
            body.start_date,
            body.end_date
          );

          payload.days = countWorkingLeaveDays(
            body.start_date,
            body.end_date,
            holidayMap
          );

          if (payload.days <= 0) {
            return res.status(400).json({
              error:
                'Selected date range has no working leave day after excluding Sundays and holidays.',
            });
          }
        }

        if (leaveType === 'Time Off') {
          return res.status(400).json({
            error: 'Please use Time Off mode for Time Off requests.',
          });
        }

        const overlappingLeave = await findOverlappingLeave({
          employeeId: body.employee_id,
          startDate: body.start_date,
          endDate: body.end_date,
          requestMode: 'leave',
        });

        if (overlappingLeave) {
          return res.status(409).json({
            error: `You already have a ${overlappingLeave.status} leave request overlapping this date range (${overlappingLeave.start_date} to ${overlappingLeave.end_date}).`,
          });
        }
      }

      // ---------- EL backup cascade + split planning ----------
      // Buckets are drawn in priority order; the LAST bucket absorbs the
      // remainder (Unpaid is unlimited). A part records the display
      // leave_type plus deduct_bucket so balances attribute correctly.
      const EL_A = 'EL (Annual Leave)';
      const EL_U = 'EL (Unpaid Leave)';
      const empId = Number(body.employee_id);
      const bucketCache = {};
      const bucketRemain = async (bucket) => {
        if (!(bucket in bucketCache)) {
          bucketCache[bucket] = Number(
            (await getBalanceDetail(empId, bucket)).balance_days || 0
          );
        }
        return bucketCache[bucket];
      };
      const planHolidayMap = await getCompanyHolidayMap(
        body.start_date,
        body.end_date
      );
      const isWorkDayStr = (dateStr) => {
        const d = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(d.getTime())) return false;
        const holiday = planHolidayMap[dateStr];
        return d.getDay() !== 0 && (!holiday || holiday.is_working_day);
      };
      const addDaysStr = (dateStr, n) => {
        const d = new Date(`${dateStr}T00:00:00`);
        d.setDate(d.getDate() + n);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      // Split a working-day range so the first part holds firstN working days.
      const partitionRange = (startDate, endDate, firstN) => {
        const dates = [];
        let cur = startDate;
        let guard = 0;
        while (cur <= endDate && guard < 400) {
          if (isWorkDayStr(cur)) dates.push(cur);
          cur = addDaysStr(cur, 1);
          guard += 1;
        }
        const first = dates.slice(0, firstN);
        const rest = dates.slice(firstN);
        return {
          first: first.length
            ? { start: first[0], end: first[first.length - 1], days: first.length }
            : null,
          rest: rest.length
            ? { start: rest[0], end: rest[rest.length - 1], days: rest.length }
            : null,
        };
      };

      const parts = [];
      const notices = [];
      const pushPart = (type, bucket, start, end, days) => {
        if (days > 0) parts.push({ type, bucket, start, end, days });
      };
      // Draw `days` working days from [startDate, endDate] across buckets in
      // order; the last bucket absorbs whatever remains.
      const allocate = async (displayType, startDate, endDate, days, buckets) => {
        let curStart = startDate;
        let remaining = days;
        for (let i = 0; i < buckets.length; i += 1) {
          const bucket = buckets[i];
          const last = i === buckets.length - 1;
          const remain = bucket === 'Unpaid Leave' ? Infinity : await bucketRemain(bucket);
          if (remaining <= remain || last) {
            pushPart(displayType, bucket, curStart, endDate, remaining);
            remaining = 0;
            break;
          }
          if (remain <= 0) continue;
          const firstN = Math.floor(remain);
          if (firstN < 1) continue;
          const { first, rest } = partitionRange(curStart, endDate, firstN);
          if (!first || !rest) {
            pushPart(displayType, bucket, curStart, endDate, remaining);
            remaining = 0;
            break;
          }
          pushPart(displayType, bucket, first.start, first.end, first.days);
          curStart = rest.start;
          remaining = rest.days;
        }
      };

      const totalDays = Number(payload.days || 0);
      if (requestMode === 'time_off') {
        const { data, error } = await supabase
          .from('leave_requests')
          .insert(payload)
          .select()
          .single();

        if (error) {
          if (error?.message?.includes('duplicate')) {
            return res.status(500).json({
              error: 'This leave request appears to already exist. Please refresh and check your request history.',
            });
          }
          return dbError(res, error);
        }

        await safeNotify(notifyLeaveSubmittedToApproverSafe, data);

        return res.status(201).json(data);
      }

      if (lateAnnualConfirmed) {
        await allocate(EL_A, body.start_date, body.end_date, totalDays, [
          'Annual Leave',
          'Unpaid Leave',
        ]);
        notices.push('Late Annual Leave recorded as EL (Annual Leave) with your confirmation.');
      } else if (leaveType === 'Annual Leave' || leaveType === EL_A) {
        const display = leaveType === EL_A ? EL_A : 'Annual Leave';
        const before = parts.length;
        await allocate(display, body.start_date, body.end_date, totalDays, [
          'Annual Leave',
          'Unpaid Leave',
        ]);
        if (parts.length > before + 1 || (parts[before] && parts[before].bucket === 'Unpaid Leave')) {
          notices.push(
            'Annual Leave balance short — remainder recorded as EL (Unpaid Leave).'
          );
        }
      } else if (leaveType === EL_U) {
        pushPart(EL_U, 'Unpaid Leave', body.start_date, body.end_date, totalDays);
      } else if (leaveType === 'Sick Leave') {
        // Sick overflow goes straight to Unpaid (skips Annual).
        const before = parts.length;
        await allocate('Sick Leave', body.start_date, body.end_date, totalDays, [
          'Sick Leave',
          'Unpaid Leave',
        ]);
        if (parts.length > before + 1 || (parts[before] && parts[before].bucket === 'Unpaid Leave')) {
          notices.push('Sick Leave balance short — remainder recorded as EL (Unpaid Leave).');
        }
      } else if (leaveType === 'Maternity/Paternity') {
        const before = parts.length;
        await allocate('Maternity/Paternity', body.start_date, body.end_date, totalDays, [
          'Maternity/Paternity',
          'Annual Leave',
          'Unpaid Leave',
        ]);
        if (parts.length > before + 1) {
          notices.push('Maternity/Paternity balance short — remainder cascaded to Annual then Unpaid Leave.');
        }
      } else if (leaveType === 'Other Leave') {
        // Other Leave can never go negative.
        const remain = await bucketRemain('Other Leave');
        if (totalDays > remain) {
          return res.status(400).json({
            error: 'Other Leave balance is insufficient for this request.',
          });
        }
        pushPart('Other Leave', 'Other Leave', body.start_date, body.end_date, totalDays);
      } else if (leaveType === 'Unpaid Leave') {
        pushPart('Unpaid Leave', 'Unpaid Leave', body.start_date, body.end_date, totalDays);
      } else {
        pushPart(leaveType, deductBucketFor(leaveType), body.start_date, body.end_date, totalDays);
      }

      if (!parts.length) {
        return res.status(400).json({ error: 'Unable to plan this leave request.' });
      }

      const created = [];
      for (const part of parts) {
        const row = {
          ...payload,
          leave_type: part.type,
          deduct_bucket: part.bucket,
          start_date: part.start,
          end_date: part.end,
          days: part.days,
          status: initialStatus,
        };
        const { data: createdRow, error: createError } = await supabase
          .from('leave_requests')
          .insert(row)
          .select()
          .single();

        if (createError) {
          if (createError?.message?.includes('duplicate')) {
            return res.status(500).json({
              error: 'This leave request appears to already exist. Please refresh and check your request history.',
            });
          }
          return dbError(res, createError);
        }

        await safeNotify(notifyLeaveSubmittedToApproverSafe, createdRow);
        created.push(createdRow);
      }

      const notice = notices.join(' ') || null;
      return res.status(201).json({ ...created[0], requests: created, notice });
    }

    // =========================
    // UPDATE / APPROVE / REJECT REQUEST
    // =========================
    if (req.method === 'PUT') {
      const {
        id,
        actor_id,
        actor_role,
        actor_department,
        status,
        decided_by,
        rejection_reason,
        ...rest
      } = req.body || {};

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { data: request, error: requestError } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (requestError) throw requestError;

      if (!request) {
        return res.status(404).json({
          error: 'Leave request not found.',
        });
      }

      const applicant = await getEmployee(request.employee_id);

      if (!applicant) {
        return res.status(404).json({
          error: 'Applicant not found.',
        });
      }

      // =========================
      // REQUEST CANCEL (applicant asks to cancel an approved leave)
      // =========================
      if (req.body.action === 'request_cancel') {
        if (!(await requireFeature('leave_approval', res))) return;
        const { id: cancelId } = req.body || {};
        if (!cancelId || Number(cancelId) !== Number(request.id)) {
          return res.status(400).json({ error: 'id is required.' });
        }
        if (request.status !== 'approved') {
          return res.status(409).json({
            error: 'Only approved leave can be cancel-requested.',
          });
        }
        if (Number(request.employee_id) !== Number(authUser.id)) {
          return res.status(403).json({
            error: 'Only the applicant can request a cancellation.',
          });
        }
        const { data: updated, error: cancelError } = await supabase
          .from('leave_requests')
          .update({ status: 'pending_cancel' })
          .eq('id', request.id)
          .select()
          .single();
        if (cancelError) throw cancelError;
        await safeInsertSystemAudit({
          module: 'leave',
          action: 'leave_cancel_requested',
          record_id: request.id,
          employee_id: request.employee_id,
          changed_by: authUser.id,
          changed_by_name: authUser?.name || null,
          old_data: request,
          new_data: updated,
        });
        await safeNotify(notifyLeaveCancelRequested, updated);
        return res.status(200).json(updated);
      }

      // =========================
      // DECIDE CANCEL (approver approves/rejects the cancellation)
      // =========================
      if (req.body.action === 'decide_cancel') {
        if (!(await requireFeature('leave_approval', res))) return;
        const { id: decideId, status: cancelDecision } = req.body || {};
        if (!decideId || Number(decideId) !== Number(request.id)) {
          return res.status(400).json({ error: 'id is required.' });
        }
        if (request.status !== 'pending_cancel') {
          return res.status(409).json({
            error: 'This request has no pending cancellation.',
          });
        }
        if (cancelDecision !== 'approved' && cancelDecision !== 'rejected') {
          return res.status(400).json({
            error: "status must be 'approved' or 'rejected'.",
          });
        }
        const deciderRole = authUser?.role || 'employee';
        const applicantSup =
          applicant.supervisor_id != null ? Number(applicant.supervisor_id) : null;
        const canDecide =
          deciderRole === 'admin' ||
          deciderRole === 'manager' ||
          (applicantSup !== null && Number(authUser.id) === applicantSup);
        if (!canDecide) {
          return res.status(403).json({
            error: 'Only the approver chain can decide cancellations.',
          });
        }
        const nextStatus = cancelDecision === 'approved' ? 'cancelled' : 'approved';
        const { data: updated, error: decideError } = await supabase
          .from('leave_requests')
          .update({
            status: nextStatus,
            decided_by: authUser?.name || 'Approver',
            decided_role: deciderRole,
            decided_at: new Date().toISOString(),
          })
          .eq('id', request.id)
          .select()
          .single();
        if (decideError) throw decideError;
        await safeInsertSystemAudit({
          module: 'leave',
          action: 'leave_cancel_decided',
          record_id: request.id,
          employee_id: request.employee_id,
          changed_by: authUser.id,
          changed_by_name: authUser?.name || null,
          old_data: request,
          new_data: updated,
        });
        // Applicant always hears the decision; teammates only on approved
        // cancel (dates + duration, never the reason). Balances recalculate
        // automatically since only status='approved' counts as used.
        await safeNotify(notifyLeaveDecision, updated);
        if (nextStatus === 'cancelled') {
          await safeNotify(notifyLeaveCancelApprovedToPeers, updated);
        }
        return res.status(200).json(updated);
      }

      // =========================
      // EDIT LEAVE REQUEST (admin/manager) + AUDIT LOG
      // =========================
      if (req.body.action === 'edit_request') {
        if (!(await requireFeature('leave_approval', res))) return;
        const role = authUser?.role || 'employee';
        const isAdmin = role === 'admin';
        const isManager = role === 'manager';

        if (!isAdmin && !isManager) {
          return res.status(403).json({
            error: 'Only admin or manager can edit leave requests.',
          });
        }

        if (['approved', 'rejected'].includes(request.status)) {
          return res.status(409).json({
            error: 'Approved or rejected leave requests cannot be edited.',
          });
        }

        if (isManager) {
          const applicantDepartment = String(applicant.department || '')
            .trim()
            .toLowerCase();

          const managerDepartment = String(actor_department || '')
            .trim()
            .toLowerCase();

          if (!applicantDepartment || applicantDepartment !== managerDepartment) {
            return res.status(403).json({
              error: 'Managers can only edit leave requests in their own department.',
            });
          }
        }

        const { action, actor_department, ...editableFields } = req.body || {};
        const allowedFields = [
          'leave_type',
          'start_date',
          'end_date',
          'days',
          'reason',
          'duties_covered_by',
          'attachment_url',
          'attachment_name',
          'attachment_path',
          'half_day_period',
          'manager_remarks',
          'admin_remarks',
          'office_remarks',
          'time_off_date',
          'time_off_period',
          'time_off_start',
          'time_off_end',
        ];

        const updatePayload = {};

        for (const field of allowedFields) {
          if (editableFields[field] !== undefined) {
            updatePayload[field] = editableFields[field];
          }
        }

        if (!Object.keys(updatePayload).length) {
          return res.status(400).json({
            error: 'No editable fields provided.',
          });
        }

        if (updatePayload.end_date && updatePayload.start_date) {
          if (new Date(updatePayload.end_date) < new Date(updatePayload.start_date)) {
            return res.status(400).json({
              error: 'End date cannot be earlier than start date.',
            });
          }

          const holidayMap = await getCompanyHolidayMap(
            updatePayload.start_date,
            updatePayload.end_date
          );

          updatePayload.days = countWorkingLeaveDays(
            updatePayload.start_date,
            updatePayload.end_date,
            holidayMap
          );
        }

        const { data, error } = await supabase
          .from('leave_requests')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        await safeInsertSystemAudit({
          module: 'leave',
          action: 'leave_request_edit',
          record_id: id,
          employee_id: request.employee_id,
          changed_by: actor_id || null,
          changed_by_name: authUser?.name || null,
          old_data: request,
          new_data: data,
          reason: req.body.reason || 'Leave request edited',
        });

        return res.status(200).json(data);
      }

      const updatePayload = {
        ...rest,
      };

      if (status) {
        if (!(await isFeatureEnabled('leave_approval'))) {
          return res.status(403).json({
            error: 'Leave approval is currently disabled.',
          });
        }

        const role = authUser?.role || 'employee';

        if (!actor_id || !role) {
          return res.status(400).json({
            error: 'Approver identity is required.',
          });
        }

        const isAdmin = role === 'admin';
        const isManager = role === 'manager';
        const applicantSupervisorId =
          applicant.supervisor_id != null
            ? Number(applicant.supervisor_id)
            : null;

        if (Number(actor_id) === Number(applicant.id) && !isAdmin) {
          return res.status(403).json({
            error: 'You cannot approve your own leave.',
          });
        }

        // Other Leave is decided by admins only (applies to approve and reject).
        if (request.leave_type === 'Other Leave' && !isAdmin) {
          return res.status(403).json({
            error: 'Only an admin can decide Other Leave requests.',
          });
        }

        if (applicantSupervisorId) {
          // Supervisor-final rule: only the assigned supervisor (Working with)
          // or an admin may decide, regardless of role. Approval is final.
          const isSupervisor = Number(actor_id) === applicantSupervisorId;

          if (!isSupervisor && !isAdmin) {
            return res.status(403).json({
              error: 'Only the assigned supervisor (Working with) or admin can act on this leave.',
            });
          }

          if (
            !['pending', 'pending_supervisor', 'pending_manager'].includes(
              request.status
            )
          ) {
            return res.status(409).json({
              error: `Leave request is not in an approvable state (${request.status}).`,
            });
          }

          if (status === 'approved' || status === 'rejected') {
            if (status === 'rejected') {
              const reason = String(
                rejection_reason ??
                  rest.admin_remarks ??
                  rest.manager_remarks ??
                  ''
              ).trim();

              if (!reason) {
                return res.status(400).json({
                  error: 'Please give a reason for rejection.',
                });
              }

              updatePayload.admin_remarks = reason;
              updatePayload.manager_remarks = reason;
              delete updatePayload.rejection_reason;
            }

            updatePayload.status = status;
          } else {
            return res.status(400).json({
              error: 'Invalid status transition.',
            });
          }
        } else {
          if (!isAdmin && !isManager) {
            return res.status(403).json({
              error: 'Only the manager or admin can act on this leave.',
            });
          }

          if (applicant.role === 'manager' && !isAdmin) {
            return res.status(403).json({
              error: 'Manager leave must be approved by admin.',
            });
          }

          if (applicant.role === 'admin' && !isAdmin) {
            return res.status(403).json({
              error: 'Admin leave must be approved by admin.',
            });
          }

          if (status === 'approved') {
            if (request.status === 'pending_supervisor') {
              if (isAdmin) {
                // Admin may approve directly.
                updatePayload.status = 'approved';
              } else if (isManager) {
                // Manager approves -> moves to department manager.
                updatePayload.status = 'pending_manager';
              } else {
                return res.status(403).json({
                  error: 'Only the manager or admin can approve this leave at this stage.',
                });
              }
            } else if (request.status === 'pending_manager') {
              if (isAdmin) {
                updatePayload.status = 'approved';
              } else if (isManager) {
                const applicantDepartment = String(applicant.department || '')
                  .trim()
                  .toLowerCase();

                const managerDepartment = String(actor_department || '')
                  .trim()
                  .toLowerCase();

                if (
                  !applicantDepartment ||
                  applicantDepartment !== managerDepartment
                ) {
                  return res.status(403).json({
                    error: 'Managers can only approve leave in their own department.',
                  });
                }

                updatePayload.status = 'approved';
              } else {
                return res.status(403).json({
                  error: 'Only the department manager or admin can approve this leave.',
                });
              }
            } else {
              return res.status(409).json({
                error: `Leave request is not in an approvable state (${request.status}).`,
              });
            }
          } else if (status === 'rejected') {
            const reason = String(
              rejection_reason ??
                rest.admin_remarks ??
                rest.manager_remarks ??
                ''
            ).trim();

            if (!reason) {
              return res.status(400).json({
                error: 'Please give a reason for rejection.',
              });
            }

            updatePayload.status = 'rejected';
            updatePayload.admin_remarks = reason;
            updatePayload.manager_remarks = reason;
            delete updatePayload.rejection_reason;
          } else {
            return res.status(400).json({
              error: 'Invalid status transition.',
            });
          }
        }

        updatePayload.decided_by = decided_by || 'Approver';
        updatePayload.decided_role = role;
        updatePayload.decided_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('leave_requests')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (status === 'approved' || status === 'rejected') {
        await safeNotify(notifyLeaveDecision, data);
        // Teammates hear about it only on approval — never on reject.
        if (status === 'approved') {
          await safeNotify(notifyLeaveApprovedToPeers, data);
        }
      }

      return res.status(200).json(data);
    }

    // =========================
    // DELETE REQUEST
    // =========================
    if (req.method === 'DELETE') {
      const { id } = req.body || {};

      if (!id) {
        return res.status(400).json({
          error: 'id is required',
        });
      }

      const { error } = await supabase
        .from('leave_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);

    return dbError(res, err);
  }
}