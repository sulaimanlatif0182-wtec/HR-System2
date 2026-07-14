import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  CalendarDays,
  Check,
  XCircle,
  Loader2,
  Download,
  Paperclip,
  Printer,
  Pencil,
  Save,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/ui';

const STATUS_TONE: Record<string, string> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
};

const LEAVE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Unpaid Leave',
  'Maternity/Paternity',
] as const;

const BALANCE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Unpaid Leave',
  'Maternity/Paternity',
] as const;

const HALF_DAY_OPTIONS = ['Full Day', 'AM', 'PM'] as const;
const TIME_OFF_PERIODS = ['AM', 'PM'] as const;

type LeaveType = (typeof LEAVE_TYPES)[number];
type HalfDayPeriod = (typeof HALF_DAY_OPTIONS)[number];
type TimeOffPeriod = (typeof TIME_OFF_PERIODS)[number];

interface LeaveFormState {
  request_mode: 'leave' | 'time_off';
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  half_day_period: HalfDayPeriod;
  time_off_date: string;
  time_off_period: TimeOffPeriod;
  time_off_start: string;
  time_off_end: string;
  reason: string;
  duties_covered_by: string;
  employee_acknowledged: boolean;
}

function daysBetween(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);

  return Math.max(
    1,
    Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
}

function calculateTimeOffHours(start: string, end: string) {
  if (!start || !end) return 0;

  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const diffMinutes = endMinutes - startMinutes;

  if (diffMinutes <= 0) return 0;

  return Math.round((diffMinutes / 60) * 100) / 100;
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return '""';

  const stringValue = String(value).replace(/"/g, '""');

  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

interface LeaveReq {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
  decided_by: string | null;
  decided_role?: string | null;
  decided_at?: string | null;
  requested_at?: string | null;

  half_day_period?: string | null;
  duties_covered_by?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  employee_acknowledged?: boolean | null;
  manager_remarks?: string | null;
  admin_remarks?: string | null;
  office_remarks?: string | null;

  request_mode?: string | null;
  time_off_date?: string | null;
  time_off_period?: string | null;
  time_off_start?: string | null;
  time_off_end?: string | null;
  time_off_hours?: number | null;
}

interface Emp {
  id: number;
  name: string;
  email?: string | null;
  department: string | null;
  title?: string | null;
  role?: string | null;
}

interface LeaveBalance {
  id: number | null;
  employee_id: number;
  leave_type: string;
  entitlement_days: number;
  used_days: number;
  balance_days: number;
}

export default function Leave() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isManagerOnly = profile?.role === 'manager';
  const isAdminOrManager =
    profile?.role === 'admin' || profile?.role === 'manager';

  const profileDepartment = String(profile?.department ?? '')
    .trim()
    .toLowerCase();

  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState<LeaveFormState>({
    request_mode: 'leave',
    leave_type: LEAVE_TYPES[0],
    start_date: '',
    end_date: '',
    half_day_period: 'Full Day',
    time_off_date: '',
    time_off_period: 'AM',
    time_off_start: '',
    time_off_end: '',
    reason: '',
    duties_covered_by: '',
    employee_acknowledged: false,
  });

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deciding, setDeciding] = useState<number | null>(null);

  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceEmployeeId, setBalanceEmployeeId] = useState<number | ''>('');
  const [editableBalances, setEditableBalances] = useState<Record<string, string>>(
    {}
  );
  const [savingBalances, setSavingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');

    try {
      const [lv, emp] = await Promise.all([
        fetch('/api/leave').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);

      setRequests(Array.isArray(lv) ? lv : []);
      setEmployees(Array.isArray(emp) ? emp : []);
    } catch {
      setError('Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async (employeeId?: number | null) => {
    if (!employeeId) return;

    setBalanceLoading(true);

    try {
      const data = await fetch(
        `/api/leave?balances=true&employee_id=${employeeId}`
      ).then((r) => r.json());

      setBalances(Array.isArray(data) ? data : []);
    } catch {
      setBalances([]);
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (profile?.id) {
      fetchBalances(profile.id);
    }
  }, [profile?.id]);

  const empMap = useMemo(() => {
    const m: Record<number, Emp> = {};

    employees.forEach((e) => {
      m[e.id] = e;
    });

    return m;
  }, [employees]);

  const visible = useMemo(() => {
    let list = requests;

    if (isAdmin) {
      list = requests;
    } else if (isManagerOnly) {
      list = requests.filter((request) => {
        const employeeDepartment = String(
          empMap[request.employee_id]?.department ?? ''
        )
          .trim()
          .toLowerCase();

        return employeeDepartment === profileDepartment;
      });
    } else {
      list = requests.filter((request) => request.employee_id === profile?.id);
    }

    if (filter !== 'all') {
      list = list.filter((request) => request.status === filter);
    }

    return list;
  }, [
    requests,
    filter,
    isAdmin,
    isManagerOnly,
    profile?.id,
    profileDepartment,
    empMap,
  ]);

  const currentEmployee = profile?.id ? empMap[profile.id] : null;

  const canApproveRequest = (request: LeaveReq) => {
    if (!profile) return false;
    if (request.status !== 'pending') return false;

    const applicant = empMap[request.employee_id];
    const applicantRole = String(applicant?.role ?? '').toLowerCase();

    if (isAdmin) {
      return true;
    }

    if (isManagerOnly) {
      if (Number(profile.id) === Number(request.employee_id)) {
        return false;
      }

      if (applicantRole === 'manager' || applicantRole === 'admin') {
        return false;
      }

      const applicantDepartment = String(applicant?.department ?? '')
        .trim()
        .toLowerCase();

      return applicantDepartment === profileDepartment;
    }

    return false;
  };

  const resetForm = () => {
    setForm({
      request_mode: 'leave',
     leave_type: LEAVE_TYPES[0],
      start_date: '',
      end_date: '',
      half_day_period: 'Full Day',
      time_off_date: '',
      time_off_period: 'AM',
      time_off_start: '',
      time_off_end: '',
      reason: '',
      duties_covered_by: '',
      employee_acknowledged: false,
  });

    setAttachmentFile(null);
    setFormError('');
  };

  const openRequestModal = () => {
    resetForm();
    setShowModal(true);
  };

  const uploadAttachment = async () => {
    if (!attachmentFile || !profile) {
      return {
        attachment_url: null,
        attachment_name: null,
      };
    }

    const extension = attachmentFile.name.split('.').pop() || 'file';
    const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    const filePath = `${profile.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('leave-attachments')
      .upload(filePath, attachmentFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message || 'Failed to upload attachment.');
    }

    const { data } = supabase.storage
      .from('leave-attachments')
      .getPublicUrl(filePath);

    return {
      attachment_url: data.publicUrl,
      attachment_name: `${safeName}.${extension}`.replace(`.${extension}.${extension}`, `.${extension}`),
    };
  };

  const handleExportCsv = () => {
    const rows = visible.map((request) => ({
      ID: request.id,
      Employee_ID: request.employee_id,
      Employee_Name:
        empMap[request.employee_id]?.name ?? `Employee #${request.employee_id}`,
      Department: empMap[request.employee_id]?.department ?? '',
      Title: empMap[request.employee_id]?.title ?? '',
      Mode: request.request_mode ?? 'leave',
      Leave_Type: request.leave_type,
      Start_Date: request.start_date,
      End_Date: request.end_date,
      Days: request.days,
      Half_Day_Period: request.half_day_period ?? '',
      Time_Off_Date: request.time_off_date ?? '',
      Time_Off_Period: request.time_off_period ?? '',
      Time_Off_Start: request.time_off_start ?? '',
      Time_Off_End: request.time_off_end ?? '',
      Time_Off_Hours: request.time_off_hours ?? '',
      Status: request.status,
      Reason: request.reason ?? '',
      Duties_Covered_By: request.duties_covered_by ?? '',
      Attachment: request.attachment_url ?? '',
      Decided_By: request.decided_by ?? '',
      Decided_Role: request.decided_role ?? '',
      Decided_At: request.decided_at ?? '',
    }));

    downloadCsv('leave-requests.csv', rows);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (!profile) return;

    if (!form.reason.trim()) {
      setFormError('Reason is required.');
      return;
    }

    if (!form.duties_covered_by.trim()) {
      setFormError('Duties covered by is required.');
      return;
    }

    if (!form.employee_acknowledged) {
      setFormError('Please acknowledge the leave request before submitting.');
      return;
    }

    let days = 0;

    if (form.request_mode === 'leave') {
      if (!form.start_date || !form.end_date) {
        setFormError('Please select a date range.');
        return;
      }

      if (new Date(form.end_date) < new Date(form.start_date)) {
        setFormError('End date cannot be earlier than start date.');
        return;
      }

      if (
        (form.half_day_period === 'AM' || form.half_day_period === 'PM') &&
        form.start_date !== form.end_date
      ) {
        setFormError('AM/PM leave must be for one date only.');
        return;
      }

      days =
        form.half_day_period === 'AM' || form.half_day_period === 'PM'
          ? 0.5
          : daysBetween(form.start_date, form.end_date);
    }

    if (form.request_mode === 'time_off') {
      if (!form.time_off_date || !form.time_off_start || !form.time_off_end) {
        setFormError('Time off date, start time and end time are required.');
        return;
      }

      const hours = calculateTimeOffHours(
        form.time_off_start,
        form.time_off_end
      );

      if (hours <= 0) {
        setFormError('Time off end time must be later than start time.');
        return;
      }

      if (hours > 2) {
        setFormError('Time Off cannot exceed 2 hours.');
        return;
      }
    }

    setSaving(true);
    setFormError('');

    try {
      const attachment = await uploadAttachment();

      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: profile.id,
          request_mode: form.request_mode,
          leave_type:
            form.request_mode === 'time_off' ? 'Time Off' : form.leave_type,
          start_date:
            form.request_mode === 'time_off' ? form.time_off_date : form.start_date,
          end_date:
            form.request_mode === 'time_off' ? form.time_off_date : form.end_date,
          days,
          half_day_period: form.half_day_period,
          time_off_date: form.time_off_date,
          time_off_period: form.time_off_period,
          time_off_start: form.time_off_start,
          time_off_end: form.time_off_end,
          reason: form.reason,
          duties_covered_by: form.duties_covered_by,
          employee_acknowledged: form.employee_acknowledged,
          attachment_url: attachment.attachment_url,
          attachment_name: attachment.attachment_name,
          status: 'pending',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to submit request');
      }

      setShowModal(false);
      resetForm();

      await fetchAll();
      await fetchBalances(profile.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: number, status: string) => {
    if (!isAdminOrManager || !profile) return;

    setDeciding(id);

    try {
      const res = await fetch('/api/leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status,
          decided_by: profile.name ?? 'Approver',
          actor_id: profile.id,
          actor_role: profile.role,
          actor_department: profile.department,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update leave request.');
      }

      await fetchAll();

      if (profile.id) {
        await fetchBalances(profile.id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update leave.');
    } finally {
      setDeciding(null);
    }
  };

  const openBalanceEditor = async () => {
    if (!isAdmin) return;

    const firstEmployeeId = employees[0]?.id ?? '';

    setBalanceEmployeeId(firstEmployeeId);
    setEditableBalances({});
    setBalanceError('');
    setShowBalanceModal(true);

    if (firstEmployeeId) {
      await loadEditableBalances(firstEmployeeId);
    }
  };

  const loadEditableBalances = async (employeeId: number | '') => {
    if (!employeeId) return;

    setBalanceLoading(true);
    setBalanceError('');

    try {
      const data = await fetch(
        `/api/leave?balances=true&employee_id=${employeeId}`
      ).then((r) => r.json());

      const next: Record<string, string> = {};

      BALANCE_TYPES.forEach((type) => {
        const row = Array.isArray(data)
          ? data.find((balance) => balance.leave_type === type)
          : null;

        next[type] = String(row?.entitlement_days ?? 0);
      });

      setEditableBalances(next);
    } catch {
      setBalanceError('Failed to load leave balances.');
    } finally {
      setBalanceLoading(false);
    }
  };

  const saveEditableBalances = async () => {
    if (!isAdmin || !balanceEmployeeId) return;

    setSavingBalances(true);
    setBalanceError('');

    try {
      for (const leaveType of BALANCE_TYPES) {
        const entitlement = Number(editableBalances[leaveType] || 0);

        const { error } = await supabase.from('leave_balances').upsert(
          {
            employee_id: Number(balanceEmployeeId),
            leave_type: leaveType,
            entitlement_days: entitlement,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'employee_id,leave_type',
          }
        );

        if (error) {
          throw error;
        }
      }

      if (profile?.id) {
        await fetchBalances(profile.id);
      }

      alert('Leave balances updated.');
      setShowBalanceModal(false);
    } catch (err) {
      setBalanceError(
        err instanceof Error
          ? err.message
          : 'Failed to update leave balances.'
      );
    } finally {
      setSavingBalances(false);
    }
  };

  const printLeaveForm = (request: LeaveReq) => {
    const employee = empMap[request.employee_id];
    const isTimeOff = request.request_mode === 'time_off';

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Leave Application Form</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #000;
      margin: 24px;
      font-size: 12px;
    }

    .sheet {
      max-width: 900px;
      margin: 0 auto;
      border: 2px solid #000;
    }

    .center {
      text-align: center;
    }

    .company {
      font-weight: bold;
      border-bottom: 2px solid #000;
      padding: 4px;
      font-size: 12px;
    }

    .title {
      font-size: 30px;
      font-weight: 900;
      border-bottom: 2px solid #000;
      padding: 8px;
      letter-spacing: 1px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    td, th {
      border: 1px solid #999;
      padding: 6px;
      vertical-align: top;
    }

    .label {
      font-weight: bold;
      width: 20%;
    }

    .section-title {
      font-weight: bold;
      text-align: center;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 6px;
      background: #f3f3f3;
    }

    .box {
      border: 1px solid #000;
      padding: 5px 10px;
      display: inline-block;
      min-width: 130px;
      text-align: center;
      font-weight: bold;
    }

    .selected {
      border: 2px solid #000;
      border-radius: 50%;
      padding: 4px 10px;
      display: inline-block;
    }

    .signature-space {
      height: 70px;
    }

    .muted {
      color: #444;
    }

    @media print {
      body {
        margin: 0;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px;">
    <button onclick="window.print()">Print</button>
  </div>

  <div class="sheet">
    <div class="company center">COMPANY NO. 564684-H</div>
    <div class="title center">LEAVE APPLICATION FORM</div>

    <table>
      <tr>
        <td class="label">Employee Name:</td>
        <td>${escapeHtml(employee?.name ?? '')}</td>
        <td class="label">ID:</td>
        <td>${escapeHtml(request.employee_id)}</td>
      </tr>
      <tr>
        <td class="label">Designation:</td>
        <td>${escapeHtml(employee?.title ?? '')}</td>
        <td class="label">Department:</td>
        <td>${escapeHtml(employee?.department ?? '')}</td>
      </tr>
      <tr>
        <td class="label">Dates Requested</td>
        <td colspan="3">
          ${
            isTimeOff
              ? `${escapeHtml(request.time_off_date)} · ${escapeHtml(
                  request.time_off_period
                )} · ${escapeHtml(request.time_off_start)} - ${escapeHtml(
                  request.time_off_end
                )} · ${escapeHtml(request.time_off_hours)} hour(s)`
              : `Leave From: ${escapeHtml(request.start_date)} To: ${escapeHtml(
                  request.end_date
                )} (${escapeHtml(request.days)} day/s · ${escapeHtml(
                  request.half_day_period ?? 'Full Day'
                )})`
          }
        </td>
      </tr>
    </table>

    <div class="section-title">Please circle in the appropriate box</div>

    <table>
      <tr>
        <td>${request.leave_type === 'Annual Leave' ? '<span class="selected">Annual Leave</span>' : 'Annual Leave'}</td>
        <td>${request.leave_type === 'Sick Leave' ? '<span class="selected">Sick Leave</span>' : 'Sick Leave'}</td>
        <td>${request.leave_type === 'Unpaid Leave' ? '<span class="selected">Unpaid Leave</span>' : 'Unpaid Leave'}</td>
        <td>${request.leave_type === 'Maternity/Paternity' ? '<span class="selected">Maternity/Paternity</span>' : 'Maternity/Paternity'}</td>
      </tr>
      <tr>
        <td>${request.leave_type === 'Time Off' ? '<span class="selected">Time Off</span>' : 'Time Off'}</td>
        <td>Absent</td>
        <td>Hospitalization</td>
        <td>Other: ____________</td>
      </tr>
    </table>

    <table>
      <tr>
        <td class="label">Reason for Requested Leave:</td>
        <td colspan="3">${escapeHtml(request.reason ?? '')}</td>
      </tr>
      <tr>
        <td class="label">Duties covered by:</td>
        <td>${escapeHtml(request.duties_covered_by ?? '')}</td>
        <td class="label">Employee's Signature:</td>
        <td>${request.employee_acknowledged ? 'Acknowledged digitally' : ''}</td>
      </tr>
      <tr>
        <td class="label">Date:</td>
        <td>${escapeHtml(request.requested_at ?? '')}</td>
        <td class="label">Status:</td>
        <td>${escapeHtml(request.status)}</td>
      </tr>
    </table>

    <table>
      <tr>
        <td class="center">
          <div class="box">Head Of Dept's Signature</div>
          <div class="signature-space"></div>
          <div>............................................</div>
          <div>Date: ............................</div>
        </td>
        <td class="center">
          <div class="box">Director's Signature</div>
          <div class="signature-space"></div>
          <div>............................................</div>
          <div>Date: ............................</div>
        </td>
      </tr>
    </table>

    <div class="section-title">FOR OFFICE USE ONLY</div>
    <div class="title center" style="font-size: 20px;">LEAVE RECORD</div>

    <table>
      <tr>
        <td class="label">Entitlement - Previous Year (b/f)</td>
        <td></td>
        <td>Day/s</td>
      </tr>
      <tr>
        <td class="label">Current Month</td>
        <td></td>
        <td>Day/s</td>
      </tr>
      <tr>
        <td class="label">Sub-Total</td>
        <td></td>
        <td>Day/s</td>
      </tr>
      <tr>
        <td class="label">Taken to date</td>
        <td></td>
        <td>Day/s</td>
      </tr>
      <tr>
        <td class="label">Applied for/Reported</td>
        <td>${escapeHtml(request.days)} day/s</td>
        <td></td>
      </tr>
      <tr>
        <td class="label">Balance</td>
        <td></td>
        <td>Day/s</td>
      </tr>
      <tr>
        <td class="label">Remark:</td>
        <td colspan="2">${escapeHtml(request.office_remarks ?? '')}</td>
      </tr>
    </table>
  </div>
</body>
</html>
`;

    const printWindow = window.open('', '_blank', 'width=1000,height=800');

    if (!printWindow) {
      alert('Popup blocked. Please allow popups to print leave form.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) return <LoadingState label="Loading leave requests…" />;

  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle={
          isAdmin
            ? 'Review and approve time-off requests across the organization.'
            : isManagerOnly
              ? `Review and approve time-off requests for ${
                  profile?.department ?? 'your department'
                }.`
              : 'Track and submit your time-off requests.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={openBalanceEditor}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/[0.05] transition-all"
              >
                <Pencil size={16} />
                Edit Balances
              </button>
            )}

            {isAdminOrManager && (
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={visible.length === 0}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              >
                <Download size={16} />
                Export CSV
              </button>
            )}

            <button
              type="button"
              onClick={openRequestModal}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:scale-[1.02] transition-all"
            >
              <Plus size={16} />
              Request Leave
            </button>
          </div>
        }
      />

      {profile && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {balanceLoading ? (
            <div className="glass rounded-2xl p-5 text-sm text-muted">
              Loading balances…
            </div>
          ) : (
            BALANCE_TYPES.map((type) => {
              const row = balances.find((b) => b.leave_type === type);
              const entitlement = Number(row?.entitlement_days ?? 0);
              const used = Number(row?.used_days ?? 0);
              const balance = Number(row?.balance_days ?? entitlement - used);
              const negative = balance < 0;

              return (
                <div key={type} className="glass rounded-2xl p-5">
                  <p className="text-xs text-muted">{type}</p>
                  <p
                    className={`font-display text-2xl font-bold mt-1 ${
                      negative ? 'text-rose' : 'text-ink'
                    }`}
                  >
                    {balance}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Used {used} / Entitlement {entitlement}
                  </p>
                  {negative && (
                    <p className="text-xs text-rose mt-2">
                      Overused by {Math.abs(balance)} day(s)
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1 mb-6 w-fit">
        {['all', 'pending', 'approved', 'rejected'].map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
              filter === f
                ? 'bg-primary/20 text-primary'
                : 'text-muted hover:text-ink'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState label="No leave requests found." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((request, i) => (
            <motion.div
              key={request.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.3) }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <p className="font-semibold text-sm">
                    {isAdminOrManager
                      ? empMap[request.employee_id]?.name ??
                        `Employee #${request.employee_id}`
                      : request.leave_type}
                  </p>

                  <p className="text-xs text-muted mt-0.5">
                    {isAdminOrManager
                      ? `${request.leave_type} · ${
                          empMap[request.employee_id]?.department ?? '—'
                        }`
                      : `${request.start_date} → ${request.end_date}`}
                  </p>
                </div>

                <Badge tone={STATUS_TONE[request.status] ?? 'default'}>
                  {request.status}
                </Badge>
              </div>

              {request.request_mode === 'time_off' ? (
                <p className="text-xs text-muted mb-2">
                  Time Off · {request.time_off_date} · {request.time_off_period}{' '}
                  · {request.time_off_start} → {request.time_off_end} ·{' '}
                  {request.time_off_hours} hour(s)
                </p>
              ) : (
                <p className="text-xs text-muted mb-2">
                  {request.start_date} → {request.end_date} · {request.days} day
                  {Number(request.days) > 1 ? 's' : ''} ·{' '}
                  {request.half_day_period ?? 'Full Day'}
                </p>
              )}

              {request.reason && (
                <p className="text-sm text-muted/90 bg-white/[0.03] rounded-lg px-3 py-2 mb-3">
                  "{request.reason}"
                </p>
              )}

              {request.duties_covered_by && (
                <p className="text-xs text-muted mb-2">
                  Duties covered by:{' '}
                  <span className="text-ink">{request.duties_covered_by}</span>
                </p>
              )}

              {request.attachment_url && (
                <a
                  href={request.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mb-3"
                >
                  <Paperclip size={13} />
                  {request.attachment_name ?? 'View attachment'}
                </a>
              )}

              {request.decided_by && request.status !== 'pending' && (
                <p className="text-xs text-muted mb-3">
                  Decided by: {request.decided_by}
                  {request.decided_role ? ` (${request.decided_role})` : ''}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => printLeaveForm(request)}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-medium text-muted hover:text-ink hover:bg-white/10 transition-all"
                >
                  <Printer size={13} />
                  Print Form
                </button>

                {canApproveRequest(request) && (
                  <>
                    <button
                      type="button"
                      onClick={() => decide(request.id, 'approved')}
                      disabled={deciding === request.id}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald/15 text-emerald border border-emerald/25 py-2 text-xs font-medium hover:bg-emerald/25 transition-all disabled:opacity-50"
                    >
                      {deciding === request.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => decide(request.id, 'rejected')}
                      disabled={deciding === request.id}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-rose/15 text-rose border border-rose/25 py-2 text-xs font-medium hover:bg-rose/25 transition-all disabled:opacity-50"
                    >
                      {deciding === request.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <XCircle size={13} />
                      )}
                      Reject
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="glass-solid rounded-2xl p-6 w-full max-w-xl pointer-events-auto max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">
                    Request Leave
                  </h3>

                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="text-muted hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, request_mode: 'leave' })
                      }
                      className={`rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all ${
                        form.request_mode === 'leave'
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-surface border-white/10 text-muted'
                      }`}
                    >
                      Leave
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, request_mode: 'time_off' })
                      }
                      className={`rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all ${
                        form.request_mode === 'time_off'
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-surface border-white/10 text-muted'
                      }`}
                    >
                      Time Off
                    </button>
                  </div>

                  {form.request_mode === 'leave' ? (
                    <>
                      <select
                        value={form.leave_type}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            leave_type: e.target.value as LeaveType,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      >
                        {LEAVE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted mb-1 block">
                            Start date
                          </label>

                          <input
                            required
                            type="date"
                            value={form.start_date}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                start_date: e.target.value,
                              })
                            }
                            className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted mb-1 block">
                            End date
                          </label>

                          <input
                            required
                            type="date"
                            value={form.end_date}
                            onChange={(e) =>
                              setForm({ ...form, end_date: e.target.value })
                            }
                            className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                          />
                        </div>
                      </div>

                      <select
                        value={form.half_day_period}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            half_day_period: e.target.value as HalfDayPeriod,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      >
                        {HALF_DAY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs text-muted mb-1 block">
                          Time Off Date
                        </label>

                        <input
                          required
                          type="date"
                          value={form.time_off_date}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              time_off_date: e.target.value,
                            })
                          }
                          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                        />
                      </div>

                      <select
                        value={form.time_off_period}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            time_off_period: e.target.value as TimeOffPeriod,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      >
                        {TIME_OFF_PERIODS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted mb-1 block">
                            Start time
                          </label>

                          <input
                            required
                            type="time"
                            value={form.time_off_start}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                time_off_start: e.target.value,
                              })
                            }
                            className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted mb-1 block">
                            End time
                          </label>

                          <input
                            required
                            type="time"
                            value={form.time_off_end}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                time_off_end: e.target.value,
                              })
                            }
                            className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                          />
                        </div>
                      </div>

                      <p className="text-xs text-muted bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                        Time Off is limited to maximum 2 hours.
                      </p>
                    </>
                  )}

                  <textarea
                    required
                    placeholder="Reason required"
                    value={form.reason}
                    onChange={(e) =>
                      setForm({ ...form, reason: e.target.value })
                    }
                    rows={3}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 resize-none"
                  />

                  <input
                    required
                    placeholder="Duties covered by"
                    value={form.duties_covered_by}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        duties_covered_by: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                  />

                  <div>
                    <label className="text-xs text-muted mb-1 block">
                      Attachment optional
                    </label>

                    <input
                      type="file"
                      onChange={(e) =>
                        setAttachmentFile(e.target.files?.[0] ?? null)
                      }
                      className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    />
                  </div>

                  <label className="flex items-start gap-2 text-xs text-muted bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2">
                    <input
                      type="checkbox"
                      checked={form.employee_acknowledged}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          employee_acknowledged: e.target.checked,
                        })
                      }
                      className="mt-0.5"
                    />
                    <span>
                      I confirm that the information provided is accurate and I
                      acknowledge this leave request.
                    </span>
                  </label>

                  {formError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold mt-2 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      'Submit Request'
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBalanceModal && isAdmin && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowBalanceModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="glass-solid rounded-2xl p-6 w-full max-w-md pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">
                    Edit Leave Balances
                  </h3>

                  <button
                    type="button"
                    onClick={() => setShowBalanceModal(false)}
                    className="text-muted hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <select
                    value={balanceEmployeeId}
                    onChange={async (e) => {
                      const id = Number(e.target.value);
                      setBalanceEmployeeId(id);
                      await loadEditableBalances(id);
                    }}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="">Select Employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} · {employee.department ?? '—'}
                      </option>
                    ))}
                  </select>

                  {balanceLoading ? (
                    <p className="text-sm text-muted">Loading balances…</p>
                  ) : (
                    BALANCE_TYPES.map((type) => (
                      <div key={type}>
                        <label className="text-xs text-muted mb-1 block">
                          {type} entitlement days
                        </label>

                        <input
                          type="number"
                          step="0.5"
                          value={editableBalances[type] ?? '0'}
                          onChange={(e) =>
                            setEditableBalances({
                              ...editableBalances,
                              [type]: e.target.value,
                            })
                          }
                          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                        />
                      </div>
                    ))
                  )}

                  {balanceError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
                      {balanceError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={saveEditableBalances}
                    disabled={savingBalances || !balanceEmployeeId}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {savingBalances ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Save size={16} />
                        Save Balances
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}