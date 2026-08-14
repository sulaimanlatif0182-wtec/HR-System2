import apiClient from '../lib/api';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Database,
  Mail,
  Clock,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

interface HealthResponse {
  ok: boolean;
  checked_at: string;
  app: Record<string, unknown>;
  environment: Record<string, boolean>;
  tables: Record<string, { ok: boolean; count: number; error?: string | null }>;
  storage: {
    ok: boolean;
    error?: string | null;
    buckets: Array<{ name: string; public?: boolean }>;
    required_buckets: Array<{ name: string; exists: boolean }>;
  };
  reminders: {
    last_logs: Array<Record<string, unknown>>;
  };
  policy?: {
    ok: boolean;
    error?: string | null;
    item_count: number;
    incomplete_count: number;
  };
}

function StatusBadge({ ok }: { ok: boolean }) {
  return <Badge tone={ok ? 'success' : 'danger'}>{ok ? 'OK' : 'Issue'}</Badge>;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function SystemHealth() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHealth = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await apiClient.get(`/api/employees?system_health=true&t=${Date.now()}`);

      setHealth(data as HealthResponse);
    } catch {
      setError('Failed to load system health.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const envRows = useMemo(
    () => Object.entries(health?.environment || {}),
    [health]
  );

  const tableRows = useMemo(
    () => Object.entries(health?.tables || {}),
    [health]
  );

  if (!isAdmin) {
    return <ErrorState message="System Health is available for Admin only." onRetry={() => undefined} />;
  }

  if (loading) return <LoadingState label="Checking system health…" />;
  if (error) return <ErrorState message={error} onRetry={fetchHealth} />;
  if (!health) return <EmptyState label="No health data available." />;

  return (
    <div>
      <PageHeader
        title="System Health"
        subtitle="Check Supabase tables, storage buckets, SMTP, cron and recent reminders without exposing secrets."
        action={
          <button
            type="button"
            onClick={fetchHealth}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-white/[0.05]"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl grid place-items-center ${health.ok ? 'bg-emerald/15 text-emerald' : 'bg-rose/15 text-rose'}`}>
            {health.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          </div>
          <div>
            <p className="text-xs text-muted">Overall Status</p>
            <p className="font-display font-semibold text-xl">{health.ok ? 'Healthy' : 'Needs Check'}</p>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <Database size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Tables Checked</p>
            <p className="font-display font-semibold text-xl">{tableRows.length}</p>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent grid place-items-center">
            <HardDrive size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Storage Buckets</p>
            <p className="font-display font-semibold text-xl">{health.storage.buckets.length}</p>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber/15 text-amber grid place-items-center">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Last Checked</p>
            <p className="font-display font-semibold text-sm">{formatDateTime(health.checked_at)}</p>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber/15 text-amber grid place-items-center">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Policy Readiness</p>
            <p className="font-display font-semibold text-xl">
              {health.policy
                ? health.policy.incomplete_count === 0
                  ? 'Ready'
                  : `${health.policy.incomplete_count} open`
                : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server size={18} className="text-primary" />
            <h3 className="font-display font-semibold">Environment Status</h3>
          </div>
          <div className="space-y-2">
            {envRows.map(([key, ok]) => (
              <div key={key} className="flex items-center justify-between rounded-xl bg-surface border border-white/10 px-4 py-3 text-sm">
                <span>{key.replace(/_/g, ' ')}</span>
                <StatusBadge ok={Boolean(ok)} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">
            Secrets are not displayed. This page only checks whether required values exist.
          </p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive size={18} className="text-accent" />
            <h3 className="font-display font-semibold">Storage Buckets</h3>
          </div>
          <div className="space-y-2">
            {health.storage.required_buckets.map((bucket) => (
              <div key={bucket.name} className="flex items-center justify-between rounded-xl bg-surface border border-white/10 px-4 py-3 text-sm">
                <span>{bucket.name}</span>
                <StatusBadge ok={bucket.exists} />
              </div>
            ))}
          </div>
          {health.storage.error && <p className="text-xs text-rose mt-3">{health.storage.error}</p>}
        </div>
      </div>

      <div className="glass rounded-2xl p-5 mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-primary" />
          <h3 className="font-display font-semibold">Database Table Checks</h3>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-white/10">
              <th className="py-3 pr-4">Table</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Rows</th>
              <th className="py-3 pr-4">Error</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map(([table, info]) => (
              <tr key={table} className="border-b border-white/5 last:border-0">
                <td className="py-3 pr-4 font-medium">{table}</td>
                <td className="py-3 pr-4"><StatusBadge ok={info.ok} /></td>
                <td className="py-3 pr-4">{info.count}</td>
                <td className="py-3 pr-4 text-xs text-muted">{info.error || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail size={18} className="text-emerald" />
            <h3 className="font-display font-semibold">Cron / Email Reminder</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="rounded-xl bg-surface border border-white/10 px-4 py-3">
              Cron path: <span className="text-primary">{String(health.app.cron_path)}</span>
            </div>
            <div className="rounded-xl bg-surface border border-white/10 px-4 py-3">
              Schedule: <span className="text-primary">{String(health.app.cron_schedule)}</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-amber" />
            <h3 className="font-display font-semibold">Recent Reminder Logs</h3>
          </div>
          {health.reminders.last_logs.length === 0 ? (
            <EmptyState label="No reminder logs found yet." />
          ) : (
            <div className="space-y-2">
              {health.reminders.last_logs.map((log, index) => (
                <div key={String(log.id || index)} className="rounded-xl bg-surface border border-white/10 p-3 text-sm">
                  <p className="font-semibold">{String(log.title || 'Reminder')}</p>
                  <p className="text-xs text-muted mt-1">{String(log.message || '')}</p>
                  <p className="text-[11px] text-muted mt-1">{formatDateTime(String(log.created_at || ''))}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-amber" />
            <h3 className="font-display font-semibold">Policy Readiness</h3>
          </div>
          {!health.policy ? (
            <EmptyState label="Policy readiness data unavailable." />
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-surface border border-white/10 px-4 py-3">
                <span>Table exists</span>
                <StatusBadge ok={health.policy.ok} />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface border border-white/10 px-4 py-3">
                <span>Policy items</span>
                <span className="font-semibold">{health.policy.item_count}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface border border-white/10 px-4 py-3">
                <span>Incomplete policies</span>
                <Badge tone={health.policy.incomplete_count === 0 ? 'success' : 'warning'}>
                  {health.policy.incomplete_count}
                </Badge>
              </div>
              {health.policy.error && (
                <p className="text-xs text-rose mt-2">{health.policy.error}</p>
              )}
              <p className="text-xs text-muted">
                Track release evidence in the Policy Center (admin).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
