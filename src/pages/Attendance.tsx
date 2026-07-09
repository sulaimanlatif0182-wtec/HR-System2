import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, LogIn, LogOut, CheckCircle2, Loader2 } from 'lucide-react';
import { PageHeader, LoadingState, ErrorState, Badge, EmptyState } from '../components/Shared';
import { useAuth } from '../contexts/AuthContext';
import type { AttendanceRecord, Employee } from '../types';

const statusTone: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  remote: 'info',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Attendance() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [a, e] = await Promise.all([
        fetch('/api/attendance').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);
      setRecords(Array.isArray(a) ? a : []);
      setEmployees(Array.isArray(e) ? e : []);
    } catch {
      setError('Failed to load attendance records.');
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

  const myTodayRecord = useMemo(() => {
    if (!profile) return null;
    return records.find((r) => r.employee_id === profile.id && r.date === todayISO()) || null;
  }, [records, profile]);

  const heatmapDays = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 41; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const count = records.filter((r) => r.date === iso && (r.status === 'present' || r.status === 'remote')).length;
      days.push({ date: iso, count });
    }
    return days;
  }, [records]);

  const maxCount = Math.max(...heatmapDays.map((d) => d.count), 1);

  const handleCheckIn = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: profile.id, date: todayISO(), check_in: new Date().toISOString(), status: 'present' }),
      });
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!myTodayRecord) return;
    setActionLoading(true);
    try {
      await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: myTodayRecord.id, check_out: new Date().toISOString() }),
      });
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState label="Loading attendance…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  const recent = records.slice(0, 30);

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Track daily check-ins and monitor org-wide presence." />

      {/* Check-in card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/30">
            <Clock size={24} className="text-white" />
          </div>
          <div>
            <p className="font-display font-semibold text-lg">
              {myTodayRecord?.check_out ? "You're all done for today" : myTodayRecord?.check_in ? "You're checked in" : 'Ready to start your day?'}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {myTodayRecord?.check_in ? `Checked in at ${new Date(myTodayRecord.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No check-in recorded yet today'}
              {myTodayRecord?.check_out ? ` · Out at ${new Date(myTodayRecord.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCheckIn}
            disabled={!!myTodayRecord?.check_in || actionLoading}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2.5 text-sm font-semibold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
          >
            {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Check In
          </button>
          <button
            onClick={handleCheckOut}
            disabled={!myTodayRecord?.check_in || !!myTodayRecord?.check_out || actionLoading}
            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-all"
          >
            <LogOut size={16} /> Check Out
          </button>
        </div>
      </motion.div>

      {/* Heatmap */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-6 mb-6">
        <h3 className="font-display font-semibold mb-1">Presence Heatmap</h3>
        <p className="text-xs text-muted mb-4">Last 42 days · org-wide presence intensity</p>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 max-w-md">
          {heatmapDays.map((d) => {
            const intensity = d.count / maxCount;
            return (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} present`}
                className="aspect-square rounded-md"
                style={{ background: intensity === 0 ? 'rgba(255,255,255,0.04)' : `rgba(139, 92, 246, ${0.15 + intensity * 0.75})` }}
              />
            );
          })}
        </div>
      </motion.div>

      {/* History table */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="font-display font-semibold">Recent History</h3>
        </div>
        {recent.length === 0 ? (
          <EmptyState label="No attendance records yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Check In</th>
                  <th className="px-6 py-3 font-medium">Check Out</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all">
                    <td className="px-6 py-3">{empMap[r.employee_id]?.name ?? `#${r.employee_id}`}</td>
                    <td className="px-6 py-3 text-muted">{r.date}</td>
                    <td className="px-6 py-3 text-muted font-mono text-xs">{r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-6 py-3 text-muted font-mono text-xs">{r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone[r.status] ?? 'default'}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
      <div className="flex items-center gap-1.5 text-xs text-muted mt-2 justify-end">
        <CheckCircle2 size={12} /> Data synced live with Supabase
      </div>
    </div>
  );
}
