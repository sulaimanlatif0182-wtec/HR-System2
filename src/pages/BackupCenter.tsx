import { useState } from 'react';
import { Archive, Download, Database, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader, Badge, EmptyState } from '../components/ui';

interface BackupItem {
  key: string;
  label: string;
  endpoint: string;
}

const BACKUP_ITEMS: BackupItem[] = [
  { key: 'employees', label: 'Employees', endpoint: '/api/employees' },
  { key: 'attendance', label: 'Attendance', endpoint: '/api/attendance' },
  { key: 'leave', label: 'Leave Requests', endpoint: '/api/leave' },
  { key: 'claims', label: 'Claims', endpoint: '/api/claims' },
  { key: 'payroll', label: 'Payroll', endpoint: '/api/payroll' },
  { key: 'payroll_batches', label: 'Payroll Batches', endpoint: '/api/payroll?batches=true' },
  { key: 'holidays', label: 'Holiday Calendar', endpoint: '/api/attendance?holidays=1' },
  { key: 'announcements', label: 'Announcements', endpoint: '/api/employees?announcements=true' },
  { key: 'hr_letters', label: 'HR Letters', endpoint: '/api/employees?hr_letters=true' },
  { key: 'performance', label: 'Performance Reviews', endpoint: '/api/employees?performance_reviews=true' },
  { key: 'audit_logs', label: 'Audit Logs', endpoint: '/api/attendance?audit_logs=1' },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8;',
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

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function flattenRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    output[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
  });
  return output;
}

export default function BackupCenter() {
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');

  const fetchItem = async (item: BackupItem) => {
    const data = await fetch(item.endpoint).then((r) => r.json()).catch(() => []);
    return Array.isArray(data) ? data : data ? [data] : [];
  };

  const backupOne = async (item: BackupItem, format: 'json' | 'csv') => {
    setLoading(true);
    setMessage('');
    try {
      const rows = await fetchItem(item);
      if (format === 'json') {
        downloadJson(`hr-backup-${item.key}-${todayKey()}.json`, rows);
      } else {
        downloadCsv(
          `hr-backup-${item.key}-${todayKey()}.csv`,
          rows.map((row) => flattenRow(row as Record<string, unknown>))
        );
      }
      setMessage(`${item.label} backup downloaded.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Failed to backup ${item.label}.`);
    } finally {
      setLoading(false);
    }
  };

  const backupAll = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result: Record<string, unknown> = {
        generated_at: new Date().toISOString(),
        source: 'WtecHR Backup Center',
      };
      for (const item of BACKUP_ITEMS) {
        result[item.key] = await fetchItem(item);
      }
      setLastBackup(result);
      downloadJson(`hr-full-backup-${todayKey()}.json`, result);
      setMessage('Full JSON backup downloaded. Keep it in a secure location.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create full backup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Backup / Export Center"
        subtitle="Download HR data exports for backup, compliance and management reporting."
        action={
          <button
            type="button"
            onClick={backupAll}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
            Full JSON Backup
          </button>
        }
      />

      {message && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {message}
        </div>
      )}

      <div className="glass rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber/15 text-amber grid place-items-center">
            <Database size={20} />
          </div>
          <div>
            <h3 className="font-display font-semibold">Important</h3>
            <p className="text-sm text-muted mt-1">
              Backup files may contain salary, IC/passport details, bank information and HR documents index.
              Store downloaded files securely and do not share them through WhatsApp or public email.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {BACKUP_ITEMS.map((item) => (
          <div key={item.key} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-semibold">{item.label}</h3>
                <p className="text-xs text-muted mt-1">{item.endpoint}</p>
              </div>
              <Badge tone="info">export</Badge>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => backupOne(item, 'json')}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold disabled:opacity-50"
              >
                <Download size={14} /> JSON
              </button>
              <button
                type="button"
                onClick={() => backupOne(item, 'csv')}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold disabled:opacity-50"
              >
                <Download size={14} /> CSV
              </button>
            </div>
          </div>
        ))}
      </div>

      {lastBackup && (
        <div className="mt-6">
          <EmptyState label="Full backup generated. Check your downloads folder." />
        </div>
      )}
    </div>
  );
}
