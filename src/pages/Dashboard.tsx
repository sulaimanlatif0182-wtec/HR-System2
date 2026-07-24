import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  CalendarDays,
  ReceiptText,
  Wallet,
  Cake,
  CalendarCheck,
  Megaphone,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

interface Employee {
  id: number;
  name: string;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  status?: string | null;
  date_of_birth?: string | null;
  probation_end_date?: string | null;
  contract_end_date?: string | null;
  work_permit_expiry?: string | null;
  passport_expiry?: string | null;
  driving_license_expiry?: string | null;
  medical_checkup_expiry?: string | null;
}

interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  status: string;
  check_in?: string | null;
  check_out?: string | null;
}

interface LeaveRequest {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  days?: number | null;
}

interface ClaimRecord {
  id: number;
  employee_id: number;
  claim_type?: string | null;
  type?: string | null;
  amount?: number | null;
  status: string;
  claim_date?: string | null;
}

interface PayrollRecord {
  id: number;
  employee_id: number;
  period: string;
  status: string;
  net_pay?: number | null;
}

interface HolidayRecord {
  id: number;
  holiday_date: string;
  name: string;
  type: string;
  is_working_day?: boolean | null;
}

interface AnnouncementRecord {
  id: number;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  expires_at?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function employeeName(id: number, employees: Employee[]) {
  return employees.find((employee) => employee.id === id)?.name ?? `Employee #${id}`;
}

function birthdayKey(value?: string | null) {
  if (!value) return '';

  const parts = value.split('-');

  if (parts.length < 3) return '';

  return `${parts[1]}-${parts[2]}`;
}

function currentPeriod() {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysUntil(dateValue?: string | null) {
  if (!dateValue) return null;

  const today = new Date(`${formatLocalDate()}T00:00:00`);
  const target = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: any;
  label: string;
  value: string | number;
  tone?: 'primary' | 'emerald' | 'amber' | 'rose' | 'accent';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald/15 text-emerald'
      : tone === 'amber'
        ? 'bg-amber/15 text-amber'
        : tone === 'rose'
          ? 'bg-rose/15 text-rose'
          : tone === 'accent'
            ? 'bg-accent/15 text-accent'
            : 'bg-primary/15 text-primary';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 flex items-center gap-3"
    >
      <div className={`w-11 h-11 rounded-xl grid place-items-center ${toneClass}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-display font-semibold text-xl">{value}</p>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const isAdminOrManager = isAdmin || isManager;
  const profileDepartment = String(profile?.department ?? '').trim().toLowerCase();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const [empData, attData, leaveData, claimData, payrollData, holidayData, announcementData] =
        await Promise.all([
          fetch('/api/employees').then((r) => r.json()),
          fetch('/api/attendance').then((r) => r.json()),
          fetch('/api/leave').then((r) => r.json()),
          fetch('/api/claims').then((r) => r.json()).catch(() => []),
          fetch('/api/payroll').then((r) => r.json()).catch(() => []),
          fetch('/api/attendance?holidays=1').then((r) => r.json()).catch(() => []),
          fetch('/api/employees?announcements=true').then((r) => r.json()).catch(() => []),
        ]);

      setEmployees(Array.isArray(empData) ? empData : []);
      setAttendance(Array.isArray(attData) ? attData : []);
      setLeave(Array.isArray(leaveData) ? leaveData : []);
      setClaims(Array.isArray(claimData) ? claimData : []);
      setPayroll(Array.isArray(payrollData) ? payrollData : []);
      setHolidays(Array.isArray(holidayData) ? holidayData : []);
      setAnnouncements(Array.isArray(announcementData) ? announcementData : []);
    } catch {
      setError('Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const visibleEmployees = useMemo(() => {
    if (isAdmin) return employees;

    if (isManager) {
      return employees.filter(
        (employee) =>
          String(employee.department ?? '').trim().toLowerCase() === profileDepartment
      );
    }

    return employees.filter((employee) => employee.id === profile?.id);
  }, [employees, isAdmin, isManager, profile?.id, profileDepartment]);

  const visibleEmployeeIds = useMemo(
    () => new Set(visibleEmployees.map((employee) => employee.id)),
    [visibleEmployees]
  );

  const today = formatLocalDate();

  const todayAttendance = attendance.filter(
    (record) => record.date === today && visibleEmployeeIds.has(record.employee_id)
  );

  const presentToday = todayAttendance.filter((record) =>
    ['present', 'late', 'remote'].includes(record.status)
  ).length;

  const lateToday = todayAttendance.filter((record) => record.status === 'late').length;

  const missingToday = Math.max(
    0,
    visibleEmployees.filter((employee) => String(employee.status ?? 'active') !== 'inactive')
      .length - todayAttendance.length
  );

  const pendingLeave = leave.filter(
    (request) =>
      request.status === 'pending' && visibleEmployeeIds.has(request.employee_id)
  );

  const pendingClaims = claims.filter(
    (claim) =>
      !['approved', 'rejected', 'cancelled', 'paid'].includes(claim.status) &&
      visibleEmployeeIds.has(claim.employee_id)
  );

  const currentPayroll = payroll.filter(
    (record) => record.period === currentPeriod() && visibleEmployeeIds.has(record.employee_id)
  );

  const draftPayroll = currentPayroll.filter((record) =>
    ['draft', 'reviewed'].includes(record.status)
  ).length;

  const upcomingHolidays = holidays
    .filter((holiday) => holiday.holiday_date >= today)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
    .slice(0, 5);

  const latestAnnouncements = announcements
    .filter((item) => !item.expires_at || item.expires_at >= today)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 4);

  const upcomingBirthdays = visibleEmployees
    .filter((employee) => employee.date_of_birth)
    .map((employee) => ({ employee, key: birthdayKey(employee.date_of_birth) }))
    .filter((row) => row.key >= today.slice(5))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 5);

  const expiryAlerts = visibleEmployees
    .flatMap((employee) =>
      [
        ['Probation End', employee.probation_end_date],
        ['Contract End', employee.contract_end_date],
        ['Work Permit', employee.work_permit_expiry],
        ['Passport', employee.passport_expiry],
        ['Driving License', employee.driving_license_expiry],
        ['Medical Checkup', employee.medical_checkup_expiry],
      ].map(([label, date]) => ({
        employee,
        label,
        date: date as string | null | undefined,
        days: daysUntil(date as string | null | undefined),
      }))
    )
    .filter((item) => item.days !== null && item.days <= 90)
    .sort((a, b) => Number(a.days) - Number(b.days))
    .slice(0, 8);

  if (loading) return <LoadingState label="Loading dashboard…" />;

  if (error) return <ErrorState message={error} onRetry={fetchDashboard} />;

  return (
    <div>
      <PageHeader
        title="HR Dashboard"
        subtitle={
          isAdminOrManager
            ? 'Management summary for attendance, leave, claims and payroll.'
            : 'Your personal HR summary.'
        }
        action={
          <button
            type="button"
            onClick={fetchDashboard}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-white/[0.05]"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Visible Employees" value={visibleEmployees.length} />
        <StatCard icon={UserCheck} label="Present Today" value={presentToday} tone="emerald" />
        <StatCard icon={Clock} label="Late Today" value={lateToday} tone="amber" />
        <StatCard icon={AlertTriangle} label="Missing Today" value={missingToday} tone="rose" />
        <StatCard icon={CalendarDays} label="Pending Leave" value={pendingLeave.length} tone="accent" />
        <StatCard icon={ReceiptText} label="Pending Claims" value={pendingClaims.length} tone="amber" />
        <StatCard icon={Wallet} label="Payroll Draft/Review" value={draftPayroll} tone="primary" />
        <StatCard icon={CalendarCheck} label="Upcoming Holidays" value={upcomingHolidays.length} tone="emerald" />
        <StatCard icon={Megaphone} label="Announcements" value={latestAnnouncements.length} tone="accent" />
        <StatCard icon={AlertTriangle} label="Expiry Alerts" value={expiryAlerts.length} tone="rose" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-5 xl:col-span-2">
          <h3 className="font-display font-semibold mb-4">Latest Announcements</h3>
          {latestAnnouncements.length === 0 ? (
            <EmptyState label="No active announcements." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {latestAnnouncements.map((item) => (
                <div key={item.id} className="rounded-xl bg-surface border border-white/10 p-4">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {item.pinned && <Badge tone="warning">Pinned</Badge>}
                    <Badge tone="info">{item.category}</Badge>
                  </div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-xs text-muted mt-1">By {item.created_by_name || 'HR'}</p>
                  <p className="text-sm text-muted mt-3 line-clamp-3 whitespace-pre-wrap">{item.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">Pending Leave</h3>
          {pendingLeave.length === 0 ? (
            <EmptyState label="No pending leave requests." />
          ) : (
            <div className="space-y-2">
              {pendingLeave.slice(0, 6).map((request) => (
                <div key={request.id} className="rounded-xl bg-surface border border-white/10 p-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">
                        {employeeName(request.employee_id, employees)}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {request.leave_type} · {request.start_date} to {request.end_date} ·{' '}
                        {request.days ?? 0} day(s)
                      </p>
                    </div>
                    <Badge tone="warning">pending</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">Upcoming Holidays</h3>
          {upcomingHolidays.length === 0 ? (
            <EmptyState label="No upcoming holidays." />
          ) : (
            <div className="space-y-2">
              {upcomingHolidays.map((holiday) => (
                <div key={holiday.id} className="rounded-xl bg-surface border border-white/10 p-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{holiday.name}</p>
                      <p className="text-xs text-muted mt-1">
                        {holiday.holiday_date} · {holiday.type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <Badge tone={holiday.is_working_day ? 'warning' : 'success'}>
                      {holiday.is_working_day ? 'Working' : 'Holiday'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">Upcoming Birthdays</h3>
          {upcomingBirthdays.length === 0 ? (
            <EmptyState label="No upcoming birthdays found." />
          ) : (
            <div className="space-y-2">
              {upcomingBirthdays.map(({ employee, key }) => (
                <div key={employee.id} className="rounded-xl bg-surface border border-white/10 p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary grid place-items-center">
                    <Cake size={16} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{employee.name}</p>
                    <p className="text-xs text-muted">{key}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">Probation / Contract / Permit Alerts</h3>
          {expiryAlerts.length === 0 ? (
            <EmptyState label="No expiry alerts within 90 days." />
          ) : (
            <div className="space-y-2">
              {expiryAlerts.map((item) => (
                <div
                  key={`${item.employee.id}-${item.label}-${item.date}`}
                  className="rounded-xl bg-surface border border-white/10 p-3"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{item.employee.name}</p>
                      <p className="text-xs text-muted mt-1">
                        {item.label} · {item.date}
                      </p>
                    </div>
                    <Badge tone={Number(item.days) < 0 ? 'danger' : Number(item.days) <= 30 ? 'warning' : 'info'}>
                      {Number(item.days) < 0
                        ? `${Math.abs(Number(item.days))}d overdue`
                        : `${item.days}d left`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">Current Payroll</h3>
          {currentPayroll.length === 0 ? (
            <EmptyState label="No payroll records for current period." />
          ) : (
            <div className="space-y-2">
              {currentPayroll.slice(0, 6).map((record) => (
                <div key={record.id} className="rounded-xl bg-surface border border-white/10 p-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">
                        {employeeName(record.employee_id, employees)}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {record.period} · RM {Number(record.net_pay ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <Badge tone={record.status === 'released' || record.status === 'paid' ? 'success' : 'warning'}>
                      {record.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}