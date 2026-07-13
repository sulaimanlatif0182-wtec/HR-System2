import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, FileText, Download } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

const PIE_COLORS = ['#8b5cf6', '#22d3ee', '#fbbf24', '#fb7185', '#34d399', '#6366f1'];

interface PayRec {
  id: number; employee_id: number; period: string; base_salary: number; bonus: number;
  deductions: number; net_pay: number; status: string;
}
interface Emp { id: number; name: string; department: string | null }

export default function Payroll() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [records, setRecords] = useState<PayRec[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [pay, emp] = await Promise.all([
        fetch('/api/payroll').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);
      setRecords(Array.isArray(pay) ? pay : []);
      setEmployees(Array.isArray(emp) ? emp : []);
    } catch {
      setError('Failed to load payroll data.');
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

  const visible = useMemo(
    () => (isManager ? records : records.filter((r) => r.employee_id === profile?.id)),
    [records, isManager, profile]
  );

  const deptSplit = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach((r) => {
      const d = empMap[r.employee_id]?.department || 'Unassigned';
      map[d] = (map[d] || 0) + Number(r.net_pay);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [records, empMap]);

  const total = records.reduce((s, r) => s + Number(r.net_pay), 0);
  const avg = records.length ? total / records.length : 0;
  const paid = records.filter((r) => r.status === 'paid').length;

  if (loading) return <LoadingState label="Crunching payroll numbers…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader title="Payroll" subtitle={isManager ? 'Organization-wide compensation overview.' : 'Your payslip history.'} />

      {isManager && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          {[
            { label: 'Total Monthly Cost', value: `$${total.toLocaleString()}`, icon: Wallet, grad: 'from-violet-500 to-fuchsia-500' },
            { label: 'Average Net Pay', value: `$${Math.round(avg).toLocaleString()}`, icon: TrendingUp, grad: 'from-cyan-400 to-blue-500' },
            { label: 'Payslips Processed', value: `${paid}/${records.length}`, icon: FileText, grad: 'from-amber-400 to-orange-500' },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div key={c.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <div className="glass rounded-2xl p-5">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.grad} grid place-items-center shadow-lg mb-4`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="font-display text-2xl font-bold">{c.value}</div>
                  <div className="text-xs text-muted mt-1">{c.label}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          className="xl:col-span-2 glass rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-display font-semibold">{isManager ? 'Payslip Records' : 'Your Payslips'}</h3>
          </div>
          {visible.length === 0 ? (
            <EmptyState label="No payroll records yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                    {isManager && <th className="px-6 py-3 font-medium">Employee</th>}
                    <th className="px-6 py-3 font-medium">Period</th>
                    <th className="px-6 py-3 font-medium">Base</th>
                    <th className="px-6 py-3 font-medium">Bonus</th>
                    <th className="px-6 py-3 font-medium">Net Pay</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all">
                      {isManager && <td className="px-6 py-3">{empMap[r.employee_id]?.name ?? `#${r.employee_id}`}</td>}
                      <td className="px-6 py-3 text-muted">{r.period}</td>
                      <td className="px-6 py-3 text-muted">${Number(r.base_salary).toLocaleString()}</td>
                      <td className="px-6 py-3 text-emerald">+${Number(r.bonus).toLocaleString()}</td>
                      <td className="px-6 py-3 font-semibold">${Number(r.net_pay).toLocaleString()}</td>
                      <td className="px-6 py-3">
                        <Badge tone={r.status === 'paid' ? 'success' : 'warning'}>{r.status}</Badge>
                      </td>
                      <td className="px-6 py-3">
                        <button className="text-muted hover:text-primary transition-all">
                          <Download size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {isManager && (
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-6"
          >
            <h3 className="font-display font-semibold mb-1">Department Cost Split</h3>
            <p className="text-xs text-muted mb-2">Payroll allocation</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={deptSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>
                  {deptSplit.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#12131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                  formatter={(v) => `$${Number(v ?? 0).toLocaleString()}`}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {deptSplit.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted truncate">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {d.name}
                  </div>
                  <span>${d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}