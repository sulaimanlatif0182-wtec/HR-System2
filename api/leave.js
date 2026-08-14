import { supabase } from '../lib/db-client.js';
import { isFeatureEnabled } from '../lib/feature-flags.js';
import { requireAuth } from '../lib/requireAuth.js';
import { setCors } from '../lib/cors.js';
import {
  notifyLeaveSubmittedToApproverSafe,
  notifyLeaveDecision,
} from '../server/notify.js';
import { parseLeaveRequest } from '../lib/validators.js';

const BALANCE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Unpaid Leave',
  'Maternity/Paternity',
  'EL',
];

const BACKDATE_ALLOWED_LEAVE_TYPES = new Set([
  'Unpaid Leave',
  'Sick Leave',
  'Maternity/Paternity',
]);

const ATTACHMENT_REQUIRED_LEAVE_TYPES = new Set([
  'Sick Leave',
  'Maternity/Paternity',
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

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

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

function countWorkingLeaveDays(startDate, endDate, holidayMap = {}) {
  const current = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(current.getTime()) || Number.isNaN(last.getTime())) {
    return 0;
  }

  if (last < current) return 0;

  let total = 0;

  while (current <= last) {
    const key = dateKey(current);
    const holiday = holidayMap[key];
    const day = current.getDay();

    // Company rule: Monday-Saturday count, Sunday excluded.
    // Holiday excluded unless marked as working day.
    if (day !== 0 && (!holiday || holiday.is_working_day)) {
      total += 1;
    }

    current.setDate(current.getDate() + 1);
  }

  return total;
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
  const { data, error } = await supabase
    .from('leave_requests')
    .select('days')
    .eq('employee_id', employeeId)
    .eq('leave_type', leaveType)
    .eq('status', 'approved');

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + Number(row.days || 0), 0);
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
    balance_days: entitlementDays + adjustmentDays - usedDays,
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

function calculateTimeOffHours(start, end) {
  if (!start || !end) return 0;

  const [startHour, startMinute] = String(start).split(':').map(Number);
  const [endHour, endMinute] = String(end).split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const diffMinutes = endMinutes - startMinutes;

  if (diffMinutes <= 0) return 0;

  return Math.round((diffMinutes / 60) * 100) / 100;
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
      const { employee_id, status, balances, adjustments } = req.query;

      if (balances === 'true') {
        if (!employee_id) {
          return res.status(400).json({
            error: 'employee_id is required for balances.',
          });
        }

        const data = await getBalances(Number(employee_id));

        return res.status(200).json(data);
      }

      if (adjustments === 'true') {
        if (!employee_id) {
          return res.status(400).json({
            error: 'employee_id is required for adjustments.',
          });
        }

        const data = await getAdjustments(Number(employee_id));

        return res.status(200).json(data);
      }

      let query = supabase
        .from('leave_requests')
        .select('*')
        .order('requested_at', { ascending: false });

      if (employee_id) query = query.eq('employee_id', employee_id);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;

      if (error) throw error;

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

      const leaveType = normalizeLeaveType(body.leave_type);
      const requestMode = body.request_mode || 'leave';
      const today = todayMalaysia();

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
        !body.attachment_url
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

      // Leave approval flow: pending_supervisor -> pending_manager -> approved.
      // Managers/Admins are approved by the department manager / admin directly.
      const initialStatus =
        employee.role === 'admin' || employee.role === 'manager'
          ? 'pending_manager'
          : employee.supervisor_id
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

      const { data, error } = await supabase
        .from('leave_requests')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message?.includes('duplicate')
            ? 'This leave request appears to already exist. Please refresh and check your request history.'
            : error.message,
        });
      }

      await safeNotify(notifyLeaveSubmittedToApproverSafe, data);

      return res.status(201).json(data);
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
      // EDIT LEAVE REQUEST (admin/manager) + AUDIT LOG
      // =========================
      if (req.body.action === 'edit_request') {
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
        const isSupervisor =
          Number(actor_id) === Number(applicant.supervisor_id);

        if (!isAdmin && !isManager && !isSupervisor) {
          return res.status(403).json({
            error: 'Only the supervisor, manager or admin can act on this leave.',
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

        if (Number(actor_id) === Number(applicant.id)) {
          return res.status(403).json({
            error: 'You cannot approve your own leave.',
          });
        }

        if (status === 'approved') {
          if (request.status === 'pending_supervisor') {
            if (isAdmin) {
              // Admin may approve directly.
              updatePayload.status = 'approved';
            } else if (isSupervisor) {
              // Supervisor approves -> moves to department manager.
              updatePayload.status = 'pending_manager';
            } else {
              return res.status(403).json({
                error: 'Only the supervisor or admin can approve this leave at this stage.',
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
            } else if (isSupervisor) {
              return res.status(403).json({
                error: 'This leave is pending the department manager approval.',
              });
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
          updatePayload.status = 'rejected';
        } else {
          return res.status(400).json({
            error: 'Invalid status transition.',
          });
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

    return res.status(500).json({
      error:
        err?.message ||
        err?.details ||
        err?.hint ||
        err?.code ||
        JSON.stringify(err) ||
        'Internal server error.',
    });
  }
}