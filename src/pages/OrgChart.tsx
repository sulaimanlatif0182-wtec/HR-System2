import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { PageHeader, LoadingState, ErrorState } from '../components/Shared';
import type { Employee, Department } from '../types';

const COLORS: Record<string, string> = {};
const PALETTE = ['#8b5cf6', '#22d3ee', '#fbbf24', '#fb7185', '#34d399', '#6366f1', '#f472b6'];

function colorFor(dept: string) {
  if (!COLORS[dept]) {
    COLORS[dept] = PALETTE[Object.keys(COLORS).length % PALETTE.length];
  }
  return COLORS[dept];
}

function initialsOf(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export default function OrgChart() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [e, d] = await Promise.all([
        fetch('/api/employees').then((r) => r.json()),
        fetch('/api/departments').then((r) => r.json()),
      ]);
      setEmployees(Array.isArray(e) ? e : []);
      setDepartments(Array.isArray(d) ? d : []);
    } catch {
      setError('Failed to load org chart.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const grouped = useMemo(() => {
    const byDept: Record<string, Employee[]> = {};
    employees.forEach((e) => {
      const key = e.department || 'Unassigned';
      if (!byDept[key]) byDept[key] = [];
      byDept[key].push(e);
    });
    // sort so admin/manager appear first within a dept
    Object.values(byDept).forEach((list) => list.sort((a, b) => {
      const rank = (r: string) => (r === 'admin' ? 0 : r === 'manager' ? 1 : 2);
      return rank(a.role) - rank(b.role);
    }));
    return byDept;
  }, [employees]);

  const ceo = employees.find((e) => e.role === 'admin');

  if (loading) return <LoadingState label="Building organization tree…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader title="Organization Chart" subtitle="Interactive reporting hierarchy across all departments." />

      {ceo && (
        <div className="flex justify-center mb-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <div className="glass rounded-2xl px-6 py-4 flex flex-col items-center gap-2 shadow-2xl shadow-primary/20 border-primary/30">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center text-xl font-bold shadow-lg">
                {initialsOf(ceo.name)}
              </div>
              <p className="font-display font-semibold">{ceo.name}</p>
              <p className="text-xs text-muted">{ceo.title}</p>
            </div>
            <div className="w-px h-10 bg-gradient-to-b from-primary/60 to-transparent" />
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Object.entries(grouped).map(([dept, members], di) => (
          <motion.div
            key={dept}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: di * 0.06 }}
            className="glass rounded-2xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorFor(dept) }} />
              <h3 className="font-display font-semibold">{dept}</h3>
              <span className="ml-auto text-xs text-muted flex items-center gap-1"><Users size={12} /> {members.length}</span>
            </div>
            <div className="space-y-2">
              {members.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: di * 0.06 + i * 0.03 }}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-white/5 ${m.role !== 'employee' ? 'bg-white/[0.04] border border-white/10' : ''}`}
                  style={{ marginLeft: m.role === 'employee' ? 14 : 0 }}
                >
                  <div
                    className="w-9 h-9 rounded-lg grid place-items-center text-xs font-bold shrink-0"
                    style={{ background: `${colorFor(dept)}30`, color: colorFor(dept) }}
                  >
                    {initialsOf(m.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-[11px] text-muted truncate">{m.title}</p>
                  </div>
                  {m.role !== 'employee' && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-primary font-semibold">{m.role}</span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {departments.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="glass rounded-2xl p-6 mt-6">
          <h3 className="font-display font-semibold mb-4">Department Budgets</h3>
          <div className="space-y-3">
            {departments.map((d) => {
              const max = Math.max(...departments.map((x) => Number(x.budget)));
              const pct = (Number(d.budget) / max) * 100;
              return (
                <div key={d.id}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: colorFor(d.name) }} />{d.name}</span>
                    <span className="text-muted">${Number(d.budget).toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: colorFor(d.name) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
