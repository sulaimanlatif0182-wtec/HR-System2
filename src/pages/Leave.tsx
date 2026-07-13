import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, CalendarDays, Check, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

const STATUS_TONE: Record<string, string> = { approved: 'success', pending: 'warning', rejected: 'danger' };
const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Maternity/Paternity', 'Bereavement'];

function daysBetween(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

interface LeaveReq {
  id: number; employee_id: number; leave_type: string; start_date: string; end_date: string;
  days: number; status: string; reason: string | null; decided_by: string | null;
}
interface Emp { id: number; name: string }

export default function Leave() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ leave_type: LEAVE_TYPES[0], start_date: '', end_date: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deciding, setDeciding] = useState<number | null>(null);

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

  useEffect(() => { fetchAll(); }, []);

  const empMap = useMemo(() => {
    const m: Record<number, Emp> = {};
    employees.forEach((e) => { m[e.id] = e; });
    return m;
  }, [employees]);

  const visible = useMemo(() => {
    let list = isManager ? requests : requests.filter((r) => r.employee_id === profile?.id);
    if (filter !== 'all') list = list.filter((r) => r.status === filter);
    return list;
  }, [requests, filter, isManager, profile]);

  const balance = useMemo(() => {
    if (!profile) return { used: 0, total: 24 };
    const used = requests
      .filter((r) => r.employee_id === profile.id && r.status === 'approved')
      .reduce((sum, r) => sum + r.days, 0);
    return { used, total: 24 };
  }, [requests, profile]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!form.start_date || !form.end_date) {
      setFormError('Please select a date range.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const days = daysBetween(form.start_date, form.end_date);
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: profile.id, ...form, days, status: 'pending' }),
      });
      if (!res.ok) throw new Error('Failed to submit request');
      setShowModal(false);
      setForm({ leave_type: LEAVE_TYPES[0], start_date: '', end_date: '', reason: '' });
      fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: number, status: string) => {
    setDeciding(id);
    try {
      await fetch('/api/leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, decided_by: profile?.name ?? 'Manager' }),
      });
      fetchAll();
    } finally {
      setDeciding(null);
    }
  };

  if (loading) return <LoadingState label="Loading leave requests…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle={isManager ? 'Review and approve time-off requests across the org.' : 'Track and submit your time-off requests.'}
        action={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:scale-[1.02] transition-all"
          >
            <Plus size={16} /> Request Leave
          </button>
        }
      />

      {!isManager && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 mb-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center shadow-lg">
            <CalendarDays size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-lg">{balance.total - balance.used} days remaining</p>
            <p className="text-xs text-muted mt-0.5">{balance.used} of {balance.total} annual leave days used</p>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mt-2 max-w-xs">
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${(balance.used / balance.total) * 100}%` }} transition={{ duration: 0.8 }}
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1 mb-6 w-fit">
        {['all', 'pending', 'approved', 'rejected'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? 'bg-primary/20 text-primary' : 'text-muted hover:text-ink'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState label="No leave requests found." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm">
                    {isManager ? empMap[r.employee_id]?.name ?? `Employee #${r.employee_id}` : r.leave_type}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {isManager ? r.leave_type : `${r.start_date} → ${r.end_date}`}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </div>
              {isManager && (
                <p className="text-xs text-muted mb-2">
                  {r.start_date} → {r.end_date} · {r.days} day{r.days > 1 ? 's' : ''}
                </p>
              )}
              {r.reason && (
                <p className="text-sm text-muted/90 bg-white/[0.03] rounded-lg px-3 py-2 mb-3">"{r.reason}"</p>
              )}
              {isManager && r.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => decide(r.id, 'approved')}
                    disabled={deciding === r.id}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald/15 text-emerald border border-emerald/25 py-2 text-xs font-medium hover:bg-emerald/25 transition-all disabled:opacity-50"
                  >
                    {deciding === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                  </button>
                  <button
                    onClick={() => decide(r.id, 'rejected')}
                    disabled={deciding === r.id}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-rose/15 text-rose border border-rose/25 py-2 text-xs font-medium hover:bg-rose/25 transition-all disabled:opacity-50"
                  >
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="glass-solid rounded-2xl p-6 w-full max-w-md pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">Request Leave</h3>
                  <button onClick={() => setShowModal(false)} className="text-muted hover:text-ink">
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={submit} className="space-y-3">
                  <select
                    value={form.leave_type}
                    onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">Start date</label>
                      <input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1 block">End date</label>
                      <input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <textarea
                    placeholder="Reason (optional)"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    rows={3}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 resize-none"
                  />
                  {formError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">{formError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold mt-2 disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : 'Submit Request'}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}