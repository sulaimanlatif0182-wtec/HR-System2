import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  XCircle,
  UserPlus,
  CheckCheck,
  Inbox,
  ReceiptText,
  Wallet,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const READ_KEY = 'wtec-notifications-read';

type NotificationType =
  | 'leave_pending'
  | 'leave_approved'
  | 'leave_rejected'
  | 'claim_pending_manager'
  | 'claim_pending_finance'
  | 'claim_approved'
  | 'claim_rejected'
  | 'claim_cancelled'
  | 'payroll_review'
  | 'payroll_release'
  | 'payslip_released'
  | 'new_employee'
  | 'attendance_alert';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string;
  time: string | null;
  link: string;
}

interface EmployeeLite {
  id: number;
  name: string;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface LeaveRequestLite {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  requested_at?: string | null;
  created_at?: string | null;
  request_mode?: string | null;
  time_off_date?: string | null;
  time_off_hours?: number | null;
}

interface ClaimLite {
  id: number;
  employee_id: number;
  claim_type: string;
  claim_date: string;
  amount: number;
  description: string;
  status: string;
  created_at?: string | null;
  manager_approved_by?: string | null;
  manager_approved_at?: string | null;
  finance_approved_by?: string | null;
  finance_approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
}

interface PayrollLite {
  id: number;
  employee_id: number;
  period: string;
  status: string;
  net_pay?: number | null;
  released_at?: string | null;
  approved_at?: string | null;
}

interface PayrollBatchLite {
  id: number;
  period: string;
  status: string;
  total_net?: number | null;
  approved_by?: string | null;
  approved_at?: string | null;
  released_by?: string | null;
  released_at?: string | null;
  created_at?: string | null;
}

function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);

    if (raw) {
      return new Set(JSON.parse(raw));
    }
  } catch {
    // ignore
  }

  return new Set();
}

function saveRead(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    // ignore
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';

  const then = new Date(iso).getTime();

  if (Number.isNaN(then)) return '';

  const secs = Math.floor((Date.now() - then) / 1000);

  if (secs < 60) return 'just now';

  const mins = Math.floor(secs / 60);

  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);

  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);

  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);

  return `${months}mo ago`;
}

function sameDepartment(a?: string | null, b?: string | null) {
  return (
    String(a ?? '').trim().toLowerCase() ===
    String(b ?? '').trim().toLowerCase()
  );
}

function isRecent(iso?: string | null, days = 14) {
  if (!iso) return false;

  const time = new Date(iso).getTime();

  if (Number.isNaN(time)) return false;

  return time > Date.now() - days * 24 * 60 * 60 * 1000;
}

function money(value: unknown) {
  return `RM ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const ICONS: Record<NotificationType, { icon: LucideIcon; cls: string }> = {
  leave_pending: {
    icon: CalendarDays,
    cls: 'bg-amber/15 text-amber',
  },
  leave_approved: {
    icon: CheckCircle2,
    cls: 'bg-emerald/15 text-emerald',
  },
  leave_rejected: {
    icon: XCircle,
    cls: 'bg-rose/15 text-rose',
  },
  claim_pending_manager: {
    icon: ReceiptText,
    cls: 'bg-amber/15 text-amber',
  },
  claim_pending_finance: {
    icon: ReceiptText,
    cls: 'bg-accent/15 text-accent',
  },
  claim_approved: {
    icon: CheckCircle2,
    cls: 'bg-emerald/15 text-emerald',
  },
  claim_rejected: {
    icon: XCircle,
    cls: 'bg-rose/15 text-rose',
  },
  claim_cancelled: {
    icon: XCircle,
    cls: 'bg-white/10 text-muted',
  },
  payroll_review: {
    icon: Wallet,
    cls: 'bg-amber/15 text-amber',
  },
  payroll_release: {
    icon: Wallet,
    cls: 'bg-accent/15 text-accent',
  },
  payslip_released: {
    icon: Wallet,
    cls: 'bg-emerald/15 text-emerald',
  },
  new_employee: {
    icon: UserPlus,
    cls: 'bg-accent/15 text-accent',
  },
  attendance_alert: {
    icon: Clock,
    cls: 'bg-rose/15 text-rose',
  },
};

export default function NotificationsBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const ref = useRef<HTMLDivElement>(null);

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const isFinanceManager =
    profile?.role === 'manager' &&
    String(profile?.department ?? '').trim().toLowerCase() === 'finance';

  useEffect(() => {
    setReadIds(loadRead());
  }, []);

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    const build = async () => {
      try {
        const [leaves, employees, claims, payroll, batches] = await Promise.all([
          fetch('/api/leave').then((r) => r.json()).catch(() => []),
          fetch('/api/employees').then((r) => r.json()).catch(() => []),
          fetch('/api/claims').then((r) => r.json()).catch(() => []),
          fetch('/api/payroll').then((r) => r.json()).catch(() => []),
          fetch('/api/payroll?batches=true').then((r) => r.json()).catch(() => []),
        ]);

        if (cancelled) return;

        const employeeList: EmployeeLite[] = Array.isArray(employees)
          ? employees
          : [];

        const empMap: Record<number, EmployeeLite> = {};

        employeeList.forEach((employee) => {
          empMap[employee.id] = employee;
        });

        const items: Notification[] = [];

        // =========================
        // LEAVE NOTIFICATIONS
        // =========================
        if (Array.isArray(leaves)) {
          for (const leave of leaves as LeaveRequestLite[]) {
            const applicant = empMap[leave.employee_id];

            const leaveTime =
              leave.decided_at ||
              leave.requested_at ||
              leave.created_at ||
              null;

            // Admin: all pending leave.
            // Manager: own department pending leave, but not own leave.
            if (leave.status === 'pending') {
              const canNotifyAdmin = isAdmin;

              const canNotifyManager =
                isManager &&
                Number(profile.id) !== Number(leave.employee_id) &&
                sameDepartment(applicant?.department, profile.department) &&
                applicant?.role !== 'manager' &&
                applicant?.role !== 'admin';

              if (canNotifyAdmin || canNotifyManager) {
                items.push({
                  id: `leave-pending-${leave.id}`,
                  type: 'leave_pending',
                  title: 'Leave request pending',
                  detail: `${
                    applicant?.name ?? `Employee #${leave.employee_id}`
                  } · ${leave.leave_type} · ${
                    leave.request_mode === 'time_off'
                      ? `${leave.time_off_hours ?? 0} hour(s)`
                      : `${leave.days} day${leave.days > 1 ? 's' : ''}`
                  }`,
                  time: leaveTime,
                  link: '/leave',
                });
              }
            }

            // Employee: own leave decision.
            if (
              Number(leave.employee_id) === Number(profile.id) &&
              (leave.status === 'approved' || leave.status === 'rejected')
            ) {
              items.push({
                id: `leave-${leave.status}-${leave.id}`,
                type:
                  leave.status === 'approved'
                    ? 'leave_approved'
                    : 'leave_rejected',
                title: `Leave ${leave.status}`,
                detail: `${leave.leave_type} · ${leave.start_date} → ${
                  leave.end_date
                }${leave.decided_by ? ` · by ${leave.decided_by}` : ''}`,
                time: leave.decided_at || leaveTime,
                link: '/leave',
              });
            }
          }
        }

        // =========================
        // CLAIM NOTIFICATIONS
        // =========================
        if (Array.isArray(claims)) {
          for (const claim of claims as ClaimLite[]) {
            const applicant = empMap[claim.employee_id];
            const claimTime =
              claim.finance_approved_at ||
              claim.manager_approved_at ||
              claim.rejected_at ||
              claim.created_at ||
              null;

            // Department manager/admin: claims pending manager approval.
            if (claim.status === 'pending_manager') {
              const canNotifyAdmin = isAdmin;

              const canNotifyManager =
                isManager &&
                Number(profile.id) !== Number(claim.employee_id) &&
                sameDepartment(applicant?.department, profile.department);

              if (canNotifyAdmin || canNotifyManager) {
                items.push({
                  id: `claim-pending-manager-${claim.id}`,
                  type: 'claim_pending_manager',
                  title: 'Claim pending manager approval',
                  detail: `${
                    applicant?.name ?? `Employee #${claim.employee_id}`
                  } · ${claim.claim_type} · ${money(claim.amount)}`,
                  time: claim.created_at ?? null,
                  link: '/claims',
                });
              }
            }

            // Finance manager/admin: claims pending finance approval.
            if (claim.status === 'pending_finance' && (isAdmin || isFinanceManager)) {
              items.push({
                id: `claim-pending-finance-${claim.id}`,
                type: 'claim_pending_finance',
                title: 'Claim pending finance approval',
                detail: `${
                  applicant?.name ?? `Employee #${claim.employee_id}`
                } · ${claim.claim_type} · ${money(claim.amount)}`,
                time: claim.manager_approved_at || claim.created_at || null,
                link: '/claims',
              });
            }

            // Employee: own claim decision.
            if (Number(claim.employee_id) === Number(profile.id)) {
              if (claim.status === 'approved') {
                items.push({
                  id: `claim-approved-${claim.id}`,
                  type: 'claim_approved',
                  title: 'Claim approved',
                  detail: `${claim.claim_type} · ${money(claim.amount)}`,
                  time: claim.finance_approved_at || claimTime,
                  link: '/claims',
                });
              }

              if (claim.status === 'rejected') {
                items.push({
                  id: `claim-rejected-${claim.id}`,
                  type: 'claim_rejected',
                  title: 'Claim rejected',
                  detail: `${claim.claim_type} · ${claim.rejection_reason ?? 'No reason'}`,
                  time: claim.rejected_at || claimTime,
                  link: '/claims',
                });
              }

              if (claim.status === 'cancelled') {
                items.push({
                  id: `claim-cancelled-${claim.id}`,
                  type: 'claim_cancelled',
                  title: 'Claim cancelled',
                  detail: `${claim.claim_type} · ${money(claim.amount)}`,
                  time: claim.rejected_at || claimTime,
                  link: '/claims',
                });
              }
            }
          }
        }

        // =========================
        // PAYROLL BATCH NOTIFICATIONS
        // =========================
        if (Array.isArray(batches) && isAdmin) {
          for (const batch of batches as PayrollBatchLite[]) {
            if (batch.status === 'draft' || batch.status === 'reviewed') {
              items.push({
                id: `payroll-review-${batch.id}-${batch.status}`,
                type: 'payroll_review',
                title: 'Payroll batch needs review',
                detail: `${batch.period} · ${money(batch.total_net ?? 0)} net total`,
                time: batch.created_at ?? null,
                link: '/payroll',
              });
            }

            if (batch.status === 'approved') {
              items.push({
                id: `payroll-release-${batch.id}-${batch.status}`,
                type: 'payroll_release',
                title: 'Payroll ready for release',
                detail: `${batch.period} approved${
                  batch.approved_by ? ` by ${batch.approved_by}` : ''
                }`,
                time: batch.approved_at ?? batch.created_at ?? null,
                link: '/payroll',
              });
            }
          }
        }

        // =========================
        // EMPLOYEE PAYSLIP NOTIFICATIONS
        // =========================
        if (Array.isArray(payroll)) {
          for (const record of payroll as PayrollLite[]) {
            if (
              Number(record.employee_id) === Number(profile.id) &&
              (record.status === 'released' || record.status === 'paid')
            ) {
              items.push({
                id: `payslip-${record.status}-${record.id}`,
                type: 'payslip_released',
                title: 'Payslip available',
                detail: `${record.period} · ${money(record.net_pay ?? 0)}`,
                time: record.released_at || record.approved_at || null,
                link: '/payroll',
              });
            }
          }
        }

        // =========================
        // NEW EMPLOYEE NOTIFICATIONS
        // =========================
        if (isAdminOrManager && employeeList.length > 0) {
          for (const employee of employeeList) {
            if (!employee.created_at) continue;
            if (!isRecent(employee.created_at, 14)) continue;
            if (Number(employee.id) === Number(profile.id)) continue;

            if (
              isAdmin ||
              (isManager && sameDepartment(employee.department, profile.department))
            ) {
              items.push({
                id: `new-employee-${employee.id}`,
                type: 'new_employee',
                title: 'New employee added',
                detail: `${employee.name}${
                  employee.title ? ` · ${employee.title}` : ''
                }${employee.department ? ` · ${employee.department}` : ''}`,
                time: employee.created_at,
                link: '/employees',
              });
            }
          }
        }

        items.sort((a, b) => {
          const aTime = a.time ? new Date(a.time).getTime() : 0;
          const bTime = b.time ? new Date(b.time).getTime() : 0;

          return bTime - aTime;
        });

        setNotifications(items.slice(0, 30));
      } catch {
        // silently ignore fetch errors
      }
    };

    build();

    const interval = window.setInterval(build, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    profile,
    isAdmin,
    isManager,
    isAdminOrManager,
    isFinanceManager,
  ]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        ref.current &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClick);

    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = useMemo(
    () => notifications.filter((notification) => !readIds.has(notification.id)),
    [notifications, readIds]
  );

  const markRead = (id: string) => {
    const next = new Set(readIds);

    next.add(id);

    setReadIds(next);
    saveRead(next);
  };

  const markAllRead = () => {
    const next = new Set(readIds);

    notifications.forEach((notification) => next.add(notification.id));

    setReadIds(next);
    saveRead(next);
  };

  const openItem = (notification: Notification) => {
    markRead(notification.id);
    setOpen(false);
    navigate(notification.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative w-10 h-10 rounded-xl grid place-items-center bg-white/5 hover:bg-white/10 transition-all"
        title="Notifications"
      >
        <Bell size={18} />

        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose text-white text-[10px] font-bold grid place-items-center border-2 border-bg">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 glass-solid border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <p className="font-display font-semibold text-sm">
                Notifications
              </p>

              {unread.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline underline-offset-2"
                >
                  <CheckCheck size={12} />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2 text-muted">
                  <Inbox size={24} className="opacity-50" />
                  <p className="text-xs">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const { icon: Icon, cls } = ICONS[notification.type];
                  const isUnread = !readIds.has(notification.id);

                  return (
                    <button
                      type="button"
                      key={notification.id}
                      onClick={() => openItem(notification)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-white/5 last:border-0 transition-all hover:bg-white/5 ${
                        isUnread ? 'bg-primary/[0.06]' : ''
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${cls}`}
                      >
                        <Icon size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm truncate ${
                              isUnread
                                ? 'font-semibold'
                                : 'font-medium text-muted'
                            }`}
                          >
                            {notification.title}
                          </p>

                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>

                        <p className="text-[11px] text-muted truncate mt-0.5">
                          {notification.detail}
                        </p>

                        {notification.time && (
                          <p className="text-[10px] text-muted/60 mt-0.5">
                            {timeAgo(notification.time)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2 text-[11px] text-muted">
                <AlertTriangle size={12} />
                Showing latest {notifications.length} notifications
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}