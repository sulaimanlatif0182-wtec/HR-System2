import apiClient from '../lib/api';
import { useCallback, useEffect, useState } from 'react';
import { FileBarChart, Printer, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, LoadingState, ErrorState, EmptyState, Badge } from '../components/ui';

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function money(value: unknown) {
  return `RM ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface MonthlyReport {
  generated_at: string;
  employees?: { total?: number; active?: number; new_joiners?: number };
  attendance?: { records?: number; late_count?: number; pending_corrections?: number };
  leave?: { pending?: number; approved_in_period?: number };
  claims?: { pending?: number; approved_amount?: number };
  payroll?: { total_net_pay?: number };
  holidays?: Array<{
    id: number;
    name: string;
    holiday_date: string;
    type?: string;
    is_working_day?: boolean;
  }>;
}

export default function MonthlyReports() {
  const { profile } = useAuth();
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [period, setPeriod] = useState(currentPeriod());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async () => {
    try {
      const data = await apiClient.get(`/api/employees?monthly_hr_report=true&period=${period}`);
      setReport(data as MonthlyReport);
    } catch {
      setError('Failed to load monthly HR report.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void (async () => {
      await fetchReport();
    })();
  }, [fetchReport]);

  if (!isAdminOrManager) {
    return <ErrorState message="Monthly HR Reports are for Admin/Manager only." onRetry={() => undefined} />;
  }

  if (loading) return <LoadingState label="Loading monthly report…" />;
  if (error) return <ErrorState message={error} onRetry={fetchReport} />;
  if (!report) return <EmptyState label="No report data." />;

  const cards = [
    ['Total Employees', report.employees?.total],
    ['Active Employees', report.employees?.active],
    ['New Joiners', report.employees?.new_joiners],
    ['Attendance Records', report.attendance?.records],
    ['Late Count', report.attendance?.late_count],
    ['Pending Corrections', report.attendance?.pending_corrections],
    ['Pending Leave', report.leave?.pending],
    ['Approved Leave', report.leave?.approved_in_period],
    ['Pending Claims', report.claims?.pending],
    ['Approved Claims', money(report.claims?.approved_amount)],
    ['Payroll Net Pay', money(report.payroll?.total_net_pay)],
    ['Holidays', report.holidays?.length || 0],
  ];

  return (
    <div>
      <style>{`
        @media print {
          body { background: white !important; color: #111 !important; }
          .no-print { display: none !important; }
          .print-card { break-inside: avoid; border: 1px solid #ddd !important; background: white !important; color: #111 !important; }
          .print-header { display: flex !important; }
          main { padding: 0 !important; max-width: none !important; }
        }
        @media screen { .print-header { display: none; } }
      `}</style>

      <div className="print-header items-center justify-between border-b-4 border-blue-700 pb-4 mb-6">
        <div className="flex items-center gap-4">
          <img src="/profile_logo.png" alt="WTEC" className="h-16 object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-blue-800">Monthly HR Report</h1>
            <p className="text-sm text-slate-600">Human Resource Department</p>
          </div>
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>Period: {period}</p>
          <p>Generated: {new Date(report.generated_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="no-print">
        <PageHeader
          title="Monthly HR Report"
          subtitle="Management report summary for employees, attendance, leave, claims, payroll and holidays."
          action={
            <div className="flex gap-2">
              <button
                onClick={fetchReport}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold"
              >
                <RefreshCw size={16} /> Refresh
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Printer size={16} /> Print / Save PDF
              </button>
            </div>
          }
        />
      </div>

      <div className="glass rounded-2xl p-5 mb-6 flex items-center gap-4 print-card">
        <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary grid place-items-center no-print">
          <FileBarChart size={22} />
        </div>
        <div>
          <p className="text-xs text-muted">Report Period</p>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="no-print bg-surface border border-white/10 rounded-xl px-3 py-2.5 mt-1"
          />
          <p className="hidden print:block font-bold text-lg">{period}</p>
        </div>
        <Badge tone="info">Generated {new Date(report.generated_at).toLocaleString()}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map(([label, value]) => (
          <div key={label} className="glass rounded-2xl p-4 print-card">
            <p className="text-xs text-muted">{label}</p>
            <p className="font-display font-semibold text-xl mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-5 print-card">
        <h3 className="font-display font-semibold mb-4">Holidays in Period</h3>
        {!report.holidays?.length ? (
          <EmptyState label="No holidays in this period." />
        ) : (
          <div className="space-y-2">
            {report.holidays.map((holiday) => (
              <div
                key={holiday.id}
                className="rounded-xl bg-surface border border-white/10 p-3 flex justify-between print-card"
              >
                <div>
                  <p className="font-semibold text-sm">{holiday.name}</p>
                  <p className="text-xs text-muted">
                    {holiday.holiday_date} · {holiday.type}
                  </p>
                </div>
                <Badge tone={holiday.is_working_day ? 'warning' : 'success'}>
                  {holiday.is_working_day ? 'Working' : 'Holiday'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="hidden print:block text-xs text-slate-500 mt-6 text-center">
        This report is generated from WtecHR and is intended for internal management use only.
      </p>
    </div>
  );
}