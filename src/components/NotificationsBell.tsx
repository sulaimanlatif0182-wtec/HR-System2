import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CalendarDays, CheckCircle2, XCircle, UserPlus, CheckCheck, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const READ_KEY = 'wtec-notifications-read';

interface Notification {
  id: string;          // unique key, e.g. "leave-pending-3"
  type: 'leave_pending' | 'leave_approved' | 'leave_rejected' | 'new_employee';
  title: string;
  detail: string;
  time: string | null; // ISO timestamp for sorting/display
  link: string;        // where clicking navigates
}

function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveRead(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids].slice(-300)));
  } catch { /* ignore */ }
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

const ICONS: Record<Notification['type'], { icon: typeof Bell; cls: string }> = {
  leave_pending: { icon: CalendarDays, cls: 'bg-amber/15 text-amber' },
  leave_approved: { icon: CheckCircle2, cls: 'bg-emerald/15 text-emerald' },
  leave_rejected: { icon: XCircle, cls: 'bg-rose/15 text-rose' },
  new_employee: { icon: UserPlus, cls: 'bg-accent/15 text-accent' },
};

export default function NotificationsBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const isManager = profile?.role === 'admin' || profile?.role === 'manager';

  useEffect(() => { setReadIds(loadRead()); }, []);

  // Build notifications from live data
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    const build = async () => {
      try {
        const [leaves, employees] = await Promise.all([
          fetch('/api/leave').then((r) => r.json()),
          fetch('/api/employees').then((r) => r.json()),
        ]);
        if (cancelled) return;

        const empMap: Record<number, { name: string }> = {};
        if (Array.isArray(employees)) {
          employees.forEach((e: { id: number; name: string }) => { empMap[e.id] = e; });
        }

        const items: Notification[] = [];

        if (Array.isArray(leaves)) {
          for (const lv of leaves) {
            // Managers/admins: pending requests need action
            if (isManager && lv.status === 'pending') {
              items.push({
                id: `leave-pending-${lv.id}`,
                type: 'leave_pending',
                title: 'Leave request pending',
                detail: `${empMap[lv.employee_id]?.name ?? `Employee #${lv.employee_id}`} · ${lv.leave_type} · ${lv.days} day${lv.days > 1 ? 's' : ''}`,
                time: lv.requested_at ?? null,
                link: '/leave',
              });
            }
            // Everyone: decisions on MY OWN requests
            if (lv.employee_id === profile.id && (lv.status === 'approved' || lv.status === 'rejected')) {
              items.push({
                id: `leave-${lv.status}-${lv.id}`,
                type: lv.status === 'approved' ? 'leave_approved' : 'leave_rejected',
                title: `Leave ${lv.status}`,
                detail: `${lv.leave_type} · ${lv.start_date} → ${lv.end_date}${lv.decided_by ? ` · by ${lv.decided_by}` : ''}`,
                time: lv.requested_at ?? null,
                link: '/leave',
              });
            }
          }
        }

        // Managers/admins: recently added employees (last 14 days)
        if (isManager && Array.isArray(employees)) {
          const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
          for (const emp of employees) {
            const created = emp.created_at ? new Date(emp.created_at).getTime() : 0;
            if (created > cutoff && emp.id !== profile.id) {
              items.push({
                id: `new-employee-${emp.id}`,
                type: 'new_employee',
                title: 'New employee added',
                detail: `${emp.name}${emp.title ? ` · ${emp.title}` : ''}${emp.department ? ` · ${emp.department}` : ''}`,
                time: emp.created_at ?? null,
                link: '/employees',
              });
            }
          }
        }

        // Newest first
        items.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
        setNotifications(items.slice(0, 20));
      } catch {
        /* silently ignore fetch errors */
      }
    };

    build();
    // Refresh every 60 seconds so new events appear without reload
    const interval = setInterval(build, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [profile, isManager]);

  // Close when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)),
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
    notifications.forEach((n) => next.add(n.id));
    setReadIds(next);
    saveRead(next);
  };

  const openItem = (n: Notification) => {
    markRead(n.id);
    setOpen(false);
    navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative w-10 h-10 rounded-xl grid place-items-center bg-white/5 hover:bg-white/10 transition-all"
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
              <p className="font-display font-semibold text-sm">Notifications</p>
              {unread.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline underline-offset-2"
                >
                  <CheckCheck size={12} /> Mark all read
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
                notifications.map((n) => {
                  const { icon: Icon, cls } = ICONS[n.type];
                  const isUnread = !readIds.has(n.id);
                  return (
                    <button
                      key={n.id}
                      onClick={() => openItem(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-white/5 last:border-0 transition-all hover:bg-white/5 ${isUnread ? 'bg-primary/[0.06]' : ''}`}
                    >
                      <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${cls}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${isUnread ? 'font-semibold' : 'font-medium text-muted'}`}>{n.title}</p>
                          {isUnread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted truncate mt-0.5">{n.detail}</p>
                        {n.time && <p className="text-[10px] text-muted/60 mt-0.5">{timeAgo(n.time)}</p>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}