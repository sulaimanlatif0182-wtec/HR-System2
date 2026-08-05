import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  ClipboardCheck,
  FileCheck,
  Database,
  Rocket,
  Activity,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

interface PolicyItem {
  key: string;
  title: string;
  description?: string | null;
  status: string;
  owner?: string | null;
  evidence?: string | null;
  last_reviewed_at?: string | null;
  updated_by_name?: string | null;
  updated_at?: string | null;
}

const POLICY_META: Array<{
  key: string;
  title: string;
  description: string;
  doc: string;
  icon: typeof ShieldCheck;
}> = [
  { key: 'security_testing', title: 'Security Testing', description: 'Semgrep, dependency audit, upload validation and audit review evidence.', doc: 'SECURITY_TESTING.md', icon: ShieldCheck },
  { key: 'code_review', title: 'Code Review', description: 'Pull request / review policy and approval evidence.', doc: 'CODE_REVIEW_POLICY.md', icon: ClipboardCheck },
  { key: 'database_setup', title: 'Database Setup', description: 'Supabase tables, storage buckets, migrations and backup confirmation.', doc: 'DATABASE_SETUP.md', icon: Database },
  { key: 'deployment_pipeline', title: 'Deployment Pipeline', description: 'GitHub, Vercel, build, environment variables and rollback process.', doc: 'DEPLOYMENT_PIPELINE.md', icon: Rocket },
  { key: 'monitoring', title: 'Monitoring & Incidents', description: 'System Health, Vercel logs, Supabase logs, SMTP, cron and incident process.', doc: 'MONITORING_AND_INCIDENTS.md', icon: Activity },
  { key: 'release_checklist', title: 'Release Checklist', description: 'Final checklist for production release sign-off.', doc: 'RELEASE_CHECKLIST.md', icon: FileCheck },
];

function statusTone(status: string) {
  if (status === 'complete') return 'success';
  if (status === 'needs_review') return 'warning';
  return 'danger';
}

function statusLabel(status: string) {
  if (status === 'complete') return 'Complete';
  if (status === 'not_started') return 'Not Started';
  return 'Needs Review';
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function PolicyCenter() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [items, setItems] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/employees?policy_readiness=true&t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to load policy readiness.');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load policy readiness.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const itemByKey = useMemo(
    () => new Map(items.map((item) => [item.key, item])),
    [items]
  );

  const updateItem = async (key: string, patch: { status?: string; owner?: string | null; evidence?: string | null; reset?: boolean }) => {
    if (!isAdmin || !profile) return;

    setSavingKey(key);
    setMessage('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'policy_readiness_update',
          key,
          actor_role: 'admin',
          changed_by: profile.id,
          changed_by_name: profile.name,
          ...patch,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to update policy readiness.');

      setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...data } : item)));
      setMessage(patch.reset ? 'Policy item reset to Needs Review.' : 'Policy readiness updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update policy readiness.');
    } finally {
      setSavingKey(null);
    }
  };

  const setEvidence = (key: string, evidence: string) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, evidence } : item)));
  };

  if (!isAdmin) {
    return <ErrorState message="Policy Center is available for Admin only." onRetry={() => undefined} />;
  }

  if (loading) return <LoadingState label="Loading policy readiness…" />;
  if (error) return <ErrorState message={error} onRetry={fetchItems} />;
  if (items.length === 0) return <EmptyState label="No policy readiness items found. Run the policy_center.sql migration first." />;

  return (
    <div>
      <PageHeader
        title="Policy Center"
        subtitle="Engineering policy & release readiness evidence. Track security testing, code review, database, deployment, monitoring and the release checklist."
        action={
          <button
            type="button"
            onClick={fetchItems}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-white/[0.05]"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      {message && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            message.includes('updated') || message.includes('Reset')
              ? 'border-emerald/30 bg-emerald/10 text-emerald'
              : 'border-rose/30 bg-rose/10 text-rose'
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {POLICY_META.map((meta) => {
          const item = itemByKey.get(meta.key);
          const Icon = meta.icon;

          return (
            <div key={meta.key} className="glass rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold">{meta.title}</h3>
                    <p className="text-xs text-muted mt-1 max-w-sm">{item?.description || meta.description}</p>
                  </div>
                </div>
                {item && <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-surface border border-white/10 px-3 py-2">
                  <p className="text-[11px] text-muted">Owner</p>
                  <p className="truncate">{item?.owner || '—'}</p>
                </div>
                <div className="rounded-xl bg-surface border border-white/10 px-3 py-2">
                  <p className="text-[11px] text-muted">Last Reviewed</p>
                  <p className="truncate">{formatDateTime(item?.last_reviewed_at)}</p>
                </div>
              </div>

              <label className="text-sm block flex-1">
                <span className="block text-xs text-muted mb-1">Evidence / Notes</span>
                <textarea
                  rows={4}
                  value={item?.evidence || ''}
                  onChange={(e) => setEvidence(meta.key, e.target.value)}
                  placeholder="Record evidence for this policy item, e.g. scan results, review approval, migration log…"
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 resize-none"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  disabled={savingKey === meta.key}
                  onClick={() => updateItem(meta.key, { status: 'complete', evidence: item?.evidence || null })}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingKey === meta.key ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Mark Complete
                </button>
                <button
                  type="button"
                  disabled={savingKey === meta.key}
                  onClick={() => updateItem(meta.key, { status: 'needs_review', evidence: item?.evidence || null })}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingKey === meta.key ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                  Mark Needs Review
                </button>
                <button
                  type="button"
                  disabled={savingKey === meta.key}
                  onClick={() => updateItem(meta.key, { reset: true })}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Reset
                </button>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted">
                  <FileText size={12} /> docs/policies/{meta.doc}
                </span>
              </div>

              {item?.updated_by_name && (
                <p className="text-[11px] text-muted -mt-2">
                  Last updated by {item.updated_by_name} · {formatDateTime(item.updated_at)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted mt-6">
        Evidence is stored in the <code className="text-primary">policy_readiness_items</code> table. Updates are written to the system audit log.
      </p>
    </div>
  );
}
