import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { Users, TrendingUp, Briefcase, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import TiltCard from '../components/TiltCard';
import { PageHeader, LoadingState, ErrorState } from '../components/Shared';
import { useAuth } from '../contexts/AuthContext';
import type { Employee, AttendanceRecord, LeaveRequest, Department, PayrollRecord } from '../types';

const COLORS = ['#8b5cf6', '#22d3ee', '#fbbf24', '#fb7185', '#34d399', '#6366f1'];

export default function Dashboard() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [e, a, l, d, p] = await Promise.all([
        fetch('/api/employees').then((r) => r.json()),
        fetch('/api/attendance').then((r) => r.json()),
        fetch('/api/leave').then((r) => r.json()),
        fetch('/api/departments').then((r) => r.json()),
        fetch('/api/payroll').then((r) => r.json()),
      ]);
      setEmployees(Array.isArray(e) ? e : []);
      setAttendance(Array.isArray(a) ? a : []);
      setLeaves(Array.isArray(l) ? l : []);
      setDepartments(Array.isArray(d) ? d : []);
      setPayroll(Array.isArray(p) ? p : []);
    } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const stats = useMemo(() => {
    const headcount = employees.length;
    const activeToday = attendance.filter((a) => a.date === new Date().toISOString().slice(0, 10) && a.status !== 'absent').length;
    const attendanceRate = attendance.length ? Math.round((attendance.filter((a) => a.status === 'present' || a.status === 'remote').length / attendance.length) * 100) : 0;
    const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;
    const payrollCost = payroll.reduce((sum, p) => sum + Number(p.net_pay || 0), 0);
    return { headcount, activeToday, attendanceRate, pendingLeaves, payrollCost };
  }, [employees, attendance, leaves, payroll]);

  const attendanceTrend = useMemo(() => {
    const byDate: Record<string, { present: number; absent: number; remote: number }> = {};
    attendance.forEach((a) => {
      if (!byDate[a.date]) byDate[a.date] = { present: 0, absent: 0, remote: 0 };
      if (a.status === 'present' || a.status === 'late') byDate[a.date].present += 1;
      else if (a.status === 'remote') byDate[a.date].remote += 1;
      else byDate[a.date].absent += 1;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, v]) => ({ date: date.slice(5), present: v.present, remote: v.remote, absent: v.absent }));
  }, [attendance]);

  const deptDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((e) => {
      const d = e.department || 'Unassigned';
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [employees]);

  const leaveBalance = useMemo(() => {
    const types: Record<string, number> = {};
    leaves.forEach((l) => {
      types[l.leave_type] = (types[l.leave_type] || 0) + l.days;
    });
    return Object.entries(types).map(([name, days]) => ({ name, days }));
  }, [leaves]);

  const kpis = [
    { label: 'Total Headcount', value: stats.headcount, icon: Users, grad: 'from-violet-500 to-fuchsia-500', delta: '+4.2%', up: true, glow: '139,92,246' },
    { label: 'Attendance Rate', value: `${stats.attendanceRate}%`, icon: TrendingUp, grad: 'from-cyan-400 to-blue-500', delta: '+1.8%', up: true, glow: '34,211,238' },
    { label: 'Pending Leave Requests', value: stats.pendingLeaves, icon: Briefcase, grad: 'from-amber-400 to-orange-500', delta: '-2', up: false, glow: '251,191,36' },
    { label: 'Monthly Payroll Cost', value: `$${(stats.payrollCost / 1000).toFixed(1)}k`, icon: Wallet, grad: 'from-emerald-400 to-teal-500', delta: '+6.1%', up: true, glow: '52,211,153' },
  ];

  if (loading) return <LoadingState label="Crunching HR metrics…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${profile?.name?.split(' ')[0] ?? 'there'} 👋`}
        subtitle="Here's what's happening across your organization today."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
            >
              <TiltCard glowColor={kpi.glow} className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${kpi.grad} grid place-items-center shadow-lg`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium ${kpi.up ? 'text-emerald' : 'text-rose'}`}>
                    {kpi.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {kpi.delta}
                  </div>
                </div>
                <div className="mt-5">
                  <div className="font-display text-3xl font-bold tracking-tight">{kpi.value}</div>
                  <div className="text-xs text-muted mt-1">{kpi.label}</div>
                </div>
              </TiltCard>
            </motion.div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="xl:col-span-2 glass rounded-2xl p-5 sm:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">Attendance Trend</h3>
              <p className="text-xs text-muted mt-0.5">Last 14 days across the org</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={attendanceTrend}>
              <defs>
                <linearGradient id="present" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="remote" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" stroke="#9391ab" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#9391ab" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#12131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="present" stroke="#8b5cf6" fill="url(#present)" strokeWidth={2} />
              <Area type="monotone" dataKey="remote" stroke="#22d3ee" fill="url(#remote)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.28 }}
          className="glass rounded-2xl p-5 sm:p-6"
        >
          <h3 className="font-display font-semibold mb-1">Department Split</h3>
          <p className="text-xs text-muted mb-2">Headcount distribution</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={deptDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>
                {deptDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#12131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
            {deptDistribution.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-muted truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                {d.name} · {d.value}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.35 }}
        className="glass rounded-2xl p-5 sm:p-6"
      >
        <h3 className="font-display font-semibold mb-1">Leave Days Requested by Type</h3>
        <p className="text-xs text-muted mb-4">All-time distribution</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={leaveBalance}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="name" stroke="#9391ab" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#9391ab" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#12131f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="days" radius={[8, 8, 0, 0]} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
