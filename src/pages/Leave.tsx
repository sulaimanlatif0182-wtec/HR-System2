import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Check, XCircle, Loader2, PlaneTakeoff } from 'lucide-react';
import { PageHeader, LoadingState, ErrorState, Badge, EmptyState } from '../components/Shared';
import { useAuth } from '../contexts/AuthContext';
import type { LeaveRequest, Employee } from '../types';

const statusTone: Record<string, 'success' | 'warning' | 'danger'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
};

const leaveTypes = ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Maternity/Paternity', 'Bereavement'];

function diffDays(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export default function Leave() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ leave_type: leaveTypes[0], start_date: '', end_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [l, e] = await Promise.all([
        fetch('/api/leave').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);
      setLeaves(Array.isArray(l) ? l : []);
      setEmployees(Array.isArray(e) ? e : []);
    } catch {
      setError('Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const empMap = useMemo(() => {
    const map: Record<number, Employee> = {};
    employees.forEach((e) => { map[e.id] = e; });
    return map;
  }, [employees]);

  const visibleLeaves = useMemo(() => {
    let list = isManager ? leaves : leaves.filter((l) => l.employee_id === profile?.id);
    if (filter !== 'all') list = list.filter((l) => l.status === filter);
    return list;
  }, [leaves, filter, isManager, profile]);

  const myBalance = useMemo(() => {
    if (!profile) return { used: 0, total: 24 };
    const used = leaves.filter((l) => l.employee_id === profile.id && l.status === 'approved').reduce((s, l) => s + l.days, 0);
    return { used, total: 24 };
  }, [leaves, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!formData.start_date || !formData.end_date) {
      setFormError('Please select a date range.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const days = diffDays(formData.start_date, formData.end_date);
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: profile.id, ...formData, days, status: 'pending' }),
      });
      if (!res.ok) throw new Error('Failed to submit request');
      setShowForm(false);
      setFormData({ leave_type: leaveTypes[0], start_date: '', end_date: '', reason: '' });
      fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (id: number, status: 'approved' | 'rejected') => {
    setDecidingId(id);
    try {
      await fetch('/api/leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, decided_by: profile?.name ?? 'Manager' }),
      });
      fetchAll();
    } finally {
      setDecidingId(null);
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
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:scale-[1.02] transition-all"
          >
            <Plus size={16} /> Request Leave
          </button>
        }
      />

      {!isManager && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 mb-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center shadow-lg">
            <PlaneTakeoff size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-lg">{myBalance.total - myBalance.used} days remaining</p>
            <p className="text-xs text-muted mt-0.5">{myBalance.used} of {myBalance.total} annual leave days used</p>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mt-2 max-w-xs">
              <motion.div initial={{ width: 0 }} animate={{ width: `${(myBalance.used / myBalance.total) * 100}%` }} transition={{ duration: 0.8 }} className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" />
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1 mb-6 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? 'bg-primary/20 text-primary' : 'text-muted hover:text-ink'}`}>
            {f}
          </button>
        ))}
      </div>

      {visibleLeaves.length === 0 ? (
        <EmptyState label="No leave requests found." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleLeaves.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm">{isManager ? empMap[l.employee_id]?.name ?? `Employee #${l.employee_id}` : l.leave_type}</p>
                  <p className="text-xs text-muted mt-0.5">{isManager ? l.leave_type : `${l.start_date} → ${l.end_date}`}</p>
                </div>
                <Badge tone={statusTone[l.status]}>{l.status}</Badge>
              </div>
              {isManager && <p className="text-xs text-muted mb-2">{l.start_date} → {l.end_date} · {l.days} day{l.days > 1 ? 's' : ''}</p>}
              {l.reason && <p className="text-sm text-muted/90 bg-white/[0.03] rounded-lg px-3 py-2 mb-3">"{l.reason}"</p>}
              {isManager && l.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => decide(l.id, 'approved')}
                    disabled={decidingId === l.id}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald/15 text-emerald border border-emerald/25 py-2 text-xs font-medium hover:bg-emerald/25 transition-all disabled:opacity-50"
                  >
                    {decidingId === l.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                  </button>
                  <button
                    onClick={() => decide(l.id, 'rejected')}
                    disabled={decidingId === l.id}
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
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowForm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="glass-solid rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">Request Leave</h3>
                  <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <select value={formData.leave_type} onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50">
                    {leaveTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">Start date</label>
                      <input required type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1 block">End date</label>
                      <input required type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <textarea placeholder="Reason (optional)" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={3} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 resize-none" />
                  {formError && <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">{formError}</p>}
                  <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold mt-2 disabled:opacity-60">
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Submit Request'}
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
