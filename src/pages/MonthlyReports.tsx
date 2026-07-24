import { useEffect, useState } from 'react';
import { FileBarChart, Printer, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, LoadingState, ErrorState, EmptyState, Badge } from '../components/ui';

function currentPeriod() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function money(v: unknown) { return `RM ${Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`; }

export default function MonthlyReports() {
  const { profile } = useAuth();
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [period, setPeriod] = useState(currentPeriod());
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReport = async () => {
    setLoading(true); setError('');
    try { const data = await fetch(`/api/employees?monthly_hr_report=true&period=${period}`).then(r=>r.json()); setReport(data); }
    catch { setError('Failed to load monthly HR report.'); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ fetchReport(); }, [period]);

  if (!isAdminOrManager) return <ErrorState message="Monthly HR Reports are for Admin/Manager only." onRetry={() => undefined} />;
  if (loading) return <LoadingState label="Loading monthly report…" />;
  if (error) return <ErrorState message={error} onRetry={fetchReport} />;
  if (!report) return <EmptyState label="No report data." />;

  const cards = [
    ['Total Employees', report.employees?.total], ['Active Employees', report.employees?.active], ['New Joiners', report.employees?.new_joiners],
    ['Attendance Records', report.attendance?.records], ['Late Count', report.attendance?.late_count], ['Pending Corrections', report.attendance?.pending_corrections],
    ['Pending Leave', report.leave?.pending], ['Approved Leave', report.leave?.approved_in_period], ['Pending Claims', report.claims?.pending],
    ['Approved Claims', money(report.claims?.approved_amount)], ['Payroll Net Pay', money(report.payroll?.total_net_pay)], ['Holidays', report.holidays?.length || 0],
  ];

  return <div>
    <PageHeader title="Monthly HR Report" subtitle="Management report summary for employees, attendance, leave, claims, payroll and holidays." action={<div className="flex gap-2"><button onClick={fetchReport} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold"><RefreshCw size={16}/>Refresh</button><button onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><Printer size={16}/>Print / Save PDF</button></div>} />
    <div className="glass rounded-2xl p-5 mb-6 flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-primary/15 text-primary grid place-items-center"><FileBarChart size={22}/></div><div><p className="text-xs text-muted">Report Period</p><input type="month" value={period} onChange={e=>setPeriod(e.target.value)} className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 mt-1" /></div><Badge tone="info">Generated {new Date(report.generated_at).toLocaleString()}</Badge></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">{cards.map(([label,value])=><div key={label} className="glass rounded-2xl p-4"><p className="text-xs text-muted">{label}</p><p className="font-display font-semibold text-xl mt-1">{value}</p></div>)}</div>
    <div className="glass rounded-2xl p-5"><h3 className="font-display font-semibold mb-4">Holidays in Period</h3>{!report.holidays?.length?<EmptyState label="No holidays in this period."/>:<div className="space-y-2">{report.holidays.map((h:any)=><div key={h.id} className="rounded-xl bg-surface border border-white/10 p-3 flex justify-between"><div><p className="font-semibold text-sm">{h.name}</p><p className="text-xs text-muted">{h.holiday_date} · {h.type}</p></div><Badge tone={h.is_working_day?'warning':'success'}>{h.is_working_day?'Working':'Holiday'}</Badge></div>)}</div>}</div>
  </div>;
}