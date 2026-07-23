import { useEffect, useMemo, useState } from 'react';
import {
  FileSearch,
  RefreshCw,
  Download,
  Database,
  User,
  CalendarDays,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/ui';

interface AuditLogRow {
  id: string;
  source_table: string;
  module: string;
  action: string;
  record_id?: number | string | null;
  employee_id?: number | null;
  changed_by?: number | null;
  changed_by_name?: string | null;
  old_data?: unknown;
  new_data?: unknown;
  reason?: string | null;
  created_at: string;
}

interface Employee {
  id: number;
  name: string;
  department?: string | null;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function moduleTone(module: string) {
  const key = module.toLowerCase();

  if (key.includes('attendance')) return 'info';
  if (key.includes('leave')) return 'success';
  if (key.includes('payroll')) return 'warning';
  if (key.includes('document')) return 'danger';
  if (key.includes('holiday')) return 'accent';

  return 'default';
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return '""';

  const stringValue = String(value).replace(/"/g, '""');

  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function jsonPreview(value: unknown) {
  if (value === null || value === undefined) return '—';

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditLogs() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');

    try {
      const [auditData, employeeData] = await Promise.all([
        fetch('/api/attendance?audit_logs=1').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);

      setLogs(Array.isArray(auditData) ? auditData : []);
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
    } catch {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const employeeMap = useMemo(() => {
    const map: Record<number, Employee> = {};

    employees.forEach((employee) => {
      map[employee.id] = employee;
    });

    return map;
  }, [employees]);

  const modules = useMemo(
    () => ['all', ...Array.from(new Set(logs.map((log) => log.module))).sort()],
    [logs]
  );

  const actions = useMemo(
    () => ['all', ...Array.from(new Set(logs.map((log) => log.action))).sort()],
    [logs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (
        employeeFilter !== 'all' &&
        Number(log.employee_id) !== Number(employeeFilter)
      ) {
        return false;
      }

      const date = log.created_at.slice(0, 10);

      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;

      return true;
    });
  }, [logs, moduleFilter, actionFilter, employeeFilter, dateFrom, dateTo]);

  const handleExport = () => {
    const rows = filteredLogs.map((log) => ({
      ID: log.id,
      Date: formatDateTime(log.created_at),
      Module: log.module,
      Action: log.action,
      Source_Table: log.source_table,
      Record_ID: log.record_id ?? '',
      Employee_ID: log.employee_id ?? '',
      Employee_Name: log.employee_id ? employeeMap[log.employee_id]?.name ?? '' : '',
      Changed_By: log.changed_by_name ?? '',
      Reason: log.reason ?? '',
      Old_Data: jsonPreview(log.old_data),
      New_Data: jsonPreview(log.new_data),
    }));

    downloadCsv('audit-logs.csv', rows);
  };

  if (!isAdmin) {
    return (
      <ErrorState
        message="Audit Logs are available for Admin only."
        onRetry={() => undefined}
      />
    );
  }

  if (loading) return <LoadingState label="Loading audit logs…" />;

  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Review system changes across attendance, leave, payroll, documents and holidays."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={fetchAll}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-white/[0.05]"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={filteredLogs.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <FileSearch size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Visible Logs</p>
            <p className="font-display font-semibold text-xl">{filteredLogs.length}</p>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent grid place-items-center">
            <Database size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Total Logs</p>
            <p className="font-display font-semibold text-xl">{logs.length}</p>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald/15 text-emerald grid place-items-center">
            <User size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Actors</p>
            <p className="font-display font-semibold text-xl">
              {new Set(logs.map((log) => log.changed_by_name).filter(Boolean)).size}
            </p>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber/15 text-amber grid place-items-center">
            <CalendarDays size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Modules</p>
            <p className="font-display font-semibold text-xl">{modules.length - 1}</p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          />
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          >
            {modules.map((module) => (
              <option key={module} value={module}>
                {module === 'all' ? 'All Modules' : module}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          >
            {actions.map((action) => (
              <option key={action} value={action}>
                {action === 'all' ? 'All Actions' : action}
              </option>
            ))}
          </select>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 xl:col-span-2"
          >
            <option value="all">All Employees</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 overflow-x-auto">
        {filteredLogs.length === 0 ? (
          <EmptyState label="No audit logs found for the selected filters." />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-white/10">
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Module</th>
                <th className="py-3 pr-4">Action</th>
                <th className="py-3 pr-4">Employee</th>
                <th className="py-3 pr-4">Changed By</th>
                <th className="py-3 pr-4">Reason</th>
                <th className="py-3 pr-4">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(0, 200).map((log) => (
                <tr key={log.id} className="border-b border-white/5 last:border-0 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                    <p className="text-[10px] text-muted mt-1">{log.source_table}</p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Badge tone={moduleTone(log.module)}>{log.module}</Badge>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">{log.action}</td>
                  <td className="py-3 pr-4 min-w-[150px]">
                    {log.employee_id
                      ? employeeMap[log.employee_id]?.name ?? `#${log.employee_id}`
                      : '—'}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {log.changed_by_name || '—'}
                  </td>
                  <td className="py-3 pr-4 min-w-[180px]">{log.reason || '—'}</td>
                  <td className="py-3 pr-4 min-w-[280px]">
                    <details>
                      <summary className="cursor-pointer text-primary text-xs font-semibold">
                        View data
                      </summary>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                        <pre className="max-h-48 overflow-auto rounded-xl bg-black/30 p-3 text-[10px] text-muted whitespace-pre-wrap">
                          {jsonPreview(log.old_data)}
                        </pre>
                        <pre className="max-h-48 overflow-auto rounded-xl bg-black/30 p-3 text-[10px] text-muted whitespace-pre-wrap">
                          {jsonPreview(log.new_data)}
                        </pre>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filteredLogs.length > 200 && (
          <p className="text-xs text-muted mt-4">
            Showing latest 200 rows. Use filters or Export CSV for full result.
          </p>
        )}
      </div>
    </div>
  );
}
