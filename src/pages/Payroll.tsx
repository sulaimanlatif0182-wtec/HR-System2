import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Wallet, TrendingUp, Receipt, Download } from 'lucide-react';
import { canExport, scopeRows, exportToExcel } from '../lib/exportExcel';
import { PageHeader, LoadingState, ErrorState, Badge, EmptyState } from '../components/Shared';
import TiltCard from '../components/TiltCard';
import { useAuth } from '../contexts/AuthContext';
import type { PayrollRecord, Employee } from '../types';

const COLORS = ['#8b5cf6', '#22d3ee', '#fbbf24', '#fb7185', '#34d399', '#6366f1'];

export default function Payroll() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [p, e] = await Promise.all([
        fetch('/api/payroll').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);
      setPayroll(Array.isArray(p) ? p : []);
      setEmployees(Array.isArray(e) ? e : []);
    } catch {
      setError('Failed to load payroll data.');
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

  const visible = useMemo(() => {
    return isManager ? payroll : payroll.filter((p) => p.employee_id === profile?.id);
  }, [payroll, isManager, profile]);

  const deptCost = useMemo(() => {
    const costs: Record<string, number> = {};
    payroll.forEach((p) => {
      const dept = empMap[p.employee_id]?.department || 'Unassigned';
      costs[dept] = (costs[dept] || 0) + Number(p.net_pay);
    });
    return Object.entries(costs).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [payroll, empMap]);

  const totalCost = payroll.reduce((s, p) => s + Number(p.net_pay), 0);
  const avgPay = payroll.length ? totalCost / payroll.length : 0;
  const paidCount = payroll.filter((p) => p.status === 'paid').length;
  const handleExport = () => {
    const scoped = scopeRows(records, profile);
    if (!scoped.length) return;
    exportToExcel(
      scoped.map((r) => ({
        Employee: empMap[r.employee_id]?.name ?? `#${r.employee_id}`,
        Department: empMap[r.employee_id]?.department ?? '',
        Period: r.period,
        'Base Salary': Number(r.base_salary),
        Bonus: Number(r.bonus),
        Deductions: Number(r.deductions),
        'Net Pay': Number(r.net_pay),
        Status: r.status,
      })),
      'WtecHR_Payroll',
      'Payroll'
    );
  };

  const exportSingle = (r: PayRec) => {
    exportToExcel(
      [{
        Employee: empMap[r.employee_id]?.name ?? `#${r.employee_id}`,
        Department: empMap[r.employee_id]?.department ?? '',
        Period: r.period,
        'Base Salary': Number(r.base_salary),
        Bonus: Number(r.bonus),
        Deductions: Number(r.deductions),
        'Net Pay': Number(r.net_pay),
        Status: r.status,
      }],
      `WtecHR_Payslip_${(empMap[r.employee_id]?.name ?? r.employee_id).toString().replace(/\s+/g, '_')}_${r.period.replace(/\s+/g, '_')}`,
      'Payslip'
    );
  };

  if (loading) return <LoadingState label="Crunching payroll numbers…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle={isManager ? 'Organization-wide compensation overview.' : 'Your payslip history.'}
        action={
          canExport(profile) ? (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-xl bg-emerald/15 text-emerald border border-emerald/25 px-4 py-2.5 text-sm font-semibold hover:bg-emerald/25 transition-all"
            >
              <FileSpreadsheet size={16} /> Export Excel
            </button>
          ) : undefined
        }
      />

      {isManager && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          {[
            { label: 'Total Monthly Cost', value: `$${totalCost.toLocaleString()}`, icon: Wallet, grad: 'from-violet-500 to-fuchsia-500' },
            { label: 'Average Net Pay', value: `$${Math.round(avgPay).toLocaleString()}`, icon: TrendingUp, grad: 'from-cyan-400 to-blue-500' },
            { label: 'Payslips Processed', value: `${paidCount}/${payroll.length}`, icon: Receipt, grad: 'from-amber-400 to-orange-500' },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <motion.div key={k.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <TiltCard className="p-5">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${k.grad} grid place-items-center shadow-lg mb-4`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="font-display text-2xl font-bold">{k.value}</div>
                  <div className="text-xs text-muted mt-1">{k.label}</div>
                </TiltCard>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="xl:col-span-2 glass rounded-2xl overflow-hidden">
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
                    <th className="px-6 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all">
                      {isManager && <td className="px-6 py-3">{empMap[p.employee_id]?.name ?? `#${p.employee_id}`}</td>}
                      <td className="px-6 py-3 text-muted">{p.period}</td>
                      <td className="px-6 py-3 text-muted">${Number(p.base_salary).toLocaleString()}</td>
                      <td className="px-6 py-3 text-emerald">+${Number(p.bonus).toLocaleString()}</td>
                      <td className="px-6 py-3 font-semibold">${Number(p.net_pay).toLocaleString()}</td>
                      <td className="px-6 py-3"><Badge tone={p.status === 'paid' ? 'success' : 'warning'}>{p.status}</Badge></td>
                      <td className="px-6 py-3"><button className="text-muted hover:text-primary transition-all"><Download size={15} /></button></td>
                      <button
                          onClick={() => exportSingle(r)}
                          title="Download this payslip"
                          className="text-muted hover:text-primary transition-all"
                        >
                          <Download size={15} />
                        </button>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {isManager && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-6">
            <h3 className="font-display font-semibold mb-1">Department Cost Split</h3>
            <p className="text-xs text-muted mb-2">Payroll allocation</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={deptCost} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>
                  {deptCost.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#12131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} formatter={((v: unknown) => `$${Number(v as number ?? 0).toLocaleString()}`) as never} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {deptCost.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted truncate"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />{d.name}</div>
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
