import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Settings,
  FileWarning,
  BellRing,
  Save,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  Download,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

interface AdminConfigMap {
  document_required_types: string[];
  profile_required_fields: string[];
  expiry_alert_days: number;
}

interface MissingChecklistRow {
  employee_id: number;
  employee_name: string;
  department?: string | null;
  missing_documents: string[];
  missing_profile_fields: string[];
  total_missing: number;
}

interface ReminderRule {
  id: number;
  name: string;
  reminder_type: string;
  days_before: number;
  enabled: boolean;
  created_at?: string;
}

interface ReminderResult {
  title: string;
  message: string;
  employee_id?: number | null;
  employee_name?: string | null;
  reminder_type: string;
}

const DEFAULT_CONFIG: AdminConfigMap = {
  document_required_types: ['IC Copy', 'Offer Letter', 'Employment Contract'],
  profile_required_fields: [
    'bank_account_no',
    'epf_no',
    'socso_no',
    'income_tax_no',
    'emergency_contact_phone',
  ],
  expiry_alert_days: 90,
};

const PROFILE_FIELD_OPTIONS = [
  ['bank_name', 'Bank Name'],
  ['bank_account_no', 'Bank Account No'],
  ['epf_no', 'EPF No'],
  ['socso_no', 'SOCSO No'],
  ['income_tax_no', 'Income Tax No'],
  ['address', 'Address'],
  ['emergency_contact_name', 'Emergency Contact Name'],
  ['emergency_contact_relationship', 'Emergency Relationship'],
  ['emergency_contact_phone', 'Emergency Phone'],
  ['marital_status', 'Marital Status'],
  ['number_of_children', 'Number of Children'],
] as const;

const REMINDER_TYPES = [
  ['expiry', 'Expiry Dates'],
  ['missing_documents', 'Missing Documents'],
  ['missing_profile', 'Missing Profile Info'],
  ['pending_approvals', 'Pending Approvals'],
] as const;

function toCsvValue(value: unknown) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(',')),
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

function commaToList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminConfig() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [config, setConfig] = useState<AdminConfigMap>(DEFAULT_CONFIG);
  const [documentTypesText, setDocumentTypesText] = useState(
    DEFAULT_CONFIG.document_required_types.join(', ')
  );
  const [checklist, setChecklist] = useState<MissingChecklistRow[]>([]);
  const [reminderRules, setReminderRules] = useState<ReminderRule[]>([]);
  const [reminderResults, setReminderResults] = useState<ReminderResult[]>([]);
  const [ruleForm, setRuleForm] = useState({
    id: null as number | null,
    name: '',
    reminder_type: 'expiry',
    days_before: '30',
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');

    try {
      const [configData, checklistData, ruleData] = await Promise.all([
        fetch('/api/employees?admin_config=true').then((r) => r.json()),
        fetch('/api/employees?document_checklist=true').then((r) => r.json()),
        fetch('/api/employees?reminder_rules=true').then((r) => r.json()),
      ]);

      const mergedConfig = { ...DEFAULT_CONFIG, ...(configData || {}) };
      setConfig(mergedConfig);
      setDocumentTypesText((mergedConfig.document_required_types || []).join(', '));
      setChecklist(Array.isArray(checklistData) ? checklistData : []);
      setReminderRules(Array.isArray(ruleData) ? ruleData : []);
    } catch {
      setError('Failed to load admin configuration center.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const missingRows = useMemo(
    () => checklist.filter((row) => row.total_missing > 0),
    [checklist]
  );

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !profile) return;

    setSaving(true);
    setMessage('');

    try {
      const nextConfig = {
        ...config,
        document_required_types: commaToList(documentTypesText),
      };

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'admin_config_save',
          config: nextConfig,
          changed_by: profile.id,
          changed_by_name: profile.name,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to save configuration.');

      setMessage('Admin configuration saved successfully.');
      await fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const saveReminderRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    if (!ruleForm.name.trim()) {
      setMessage('Reminder rule name is required.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reminder_rule_save',
          ...ruleForm,
          days_before: Number(ruleForm.days_before || 0),
          changed_by: profile.id,
          changed_by_name: profile.name,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to save reminder rule.');

      setRuleForm({ id: null, name: '', reminder_type: 'expiry', days_before: '30', enabled: true });
      setMessage('Reminder rule saved successfully.');
      await fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save reminder rule.');
    } finally {
      setSaving(false);
    }
  };

  const deleteReminderRule = async (rule: ReminderRule) => {
    if (!isAdmin || !profile) return;
    if (!window.confirm(`Delete reminder rule "${rule.name}"?`)) return;

    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reminder_rule_delete',
          id: rule.id,
          changed_by: profile.id,
          changed_by_name: profile.name,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to delete reminder rule.');

      setMessage('Reminder rule deleted successfully.');
      await fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete reminder rule.');
    } finally {
      setSaving(false);
    }
  };

  const runReminders = async () => {
    if (!isAdmin || !profile) return;

    setRunning(true);
    setMessage('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run_reminders',
          changed_by: profile.id,
          changed_by_name: profile.name,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to run reminders.');

      setReminderResults(Array.isArray(data?.results) ? data.results : []);
      const emailInfo = data?.email?.sent
        ? ` Email sent to ${data.email.sent} recipient(s).`
        : data?.email?.skipped
          ? ` Email skipped: ${data.email.reason}`
          : data?.email?.error
            ? ` Email error: ${data.email.error}`
            : '';
      setMessage(
        `Reminder check completed. ${data?.results?.length || 0} reminder(s) found.${emailInfo}`
      );
      await fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to run reminders.');
    } finally {
      setRunning(false);
    }
  };

  const exportChecklist = () => {
    downloadCsv(
      'document-missing-checklist.csv',
      missingRows.map((row) => ({
        Employee_ID: row.employee_id,
        Employee_Name: row.employee_name,
        Department: row.department || '',
        Missing_Documents: row.missing_documents.join('; '),
        Missing_Profile_Fields: row.missing_profile_fields.join('; '),
        Total_Missing: row.total_missing,
      }))
    );
  };

  if (!isAdmin) {
    return <ErrorState message="Admin Configuration Center is for Admin only." onRetry={() => undefined} />;
  }

  if (loading) return <LoadingState label="Loading admin configuration center…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Admin Configuration Center"
        subtitle="Manage document requirements, HR completeness checks and reminder rules."
        action={
          <button
            type="button"
            onClick={fetchAll}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-white/[0.05]"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      {message && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            message.includes('success') || message.includes('completed')
              ? 'border-emerald/30 bg-emerald/10 text-emerald'
              : 'border-rose/30 bg-rose/10 text-rose'
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <form onSubmit={saveConfig} className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="font-display font-semibold">Document & Profile Requirements</h3>
              <p className="text-xs text-muted mt-1">
                Configure what HR considers mandatory for complete employee records.
              </p>
            </div>
          </div>

          <label className="text-sm block">
            <span className="block text-xs text-muted mb-1">Required Document Types</span>
            <textarea
              rows={3}
              value={documentTypesText}
              onChange={(e) => setDocumentTypesText(e.target.value)}
              placeholder="IC Copy, Offer Letter, Employment Contract"
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 resize-none"
            />
            <span className="text-[11px] text-muted">Separate with comma.</span>
          </label>

          <div>
            <p className="text-xs text-muted mb-2">Required Profile Fields</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROFILE_FIELD_OPTIONS.map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-muted"
                >
                  <input
                    type="checkbox"
                    checked={config.profile_required_fields.includes(key)}
                    onChange={(e) => {
                      const set = new Set(config.profile_required_fields);
                      if (e.target.checked) set.add(key);
                      else set.delete(key);
                      setConfig({ ...config, profile_required_fields: Array.from(set) });
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <label className="text-sm block">
            <span className="block text-xs text-muted mb-1">Default Expiry Alert Days</span>
            <input
              type="number"
              min="1"
              value={config.expiry_alert_days}
              onChange={(e) =>
                setConfig({ ...config, expiry_alert_days: Number(e.target.value || 90) })
              }
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Configuration
          </button>
        </form>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber/15 text-amber grid place-items-center">
                <FileWarning size={20} />
              </div>
              <div>
                <h3 className="font-display font-semibold">Document Missing Checklist</h3>
                <p className="text-xs text-muted mt-1">
                  Employees missing required documents or profile information.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={exportChecklist}
              disabled={missingRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              <Download size={14} /> CSV
            </button>
          </div>

          {missingRows.length === 0 ? (
            <EmptyState label="No missing required documents/profile fields found." />
          ) : (
            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {missingRows.map((row) => (
                <div key={row.employee_id} className="rounded-xl border border-white/10 bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{row.employee_name}</p>
                      <p className="text-xs text-muted mt-1">{row.department || '—'}</p>
                    </div>
                    <Badge tone="danger">{row.total_missing} missing</Badge>
                  </div>
                  {row.missing_documents.length > 0 && (
                    <p className="text-xs text-muted mt-3">
                      Documents: {row.missing_documents.join(', ')}
                    </p>
                  )}
                  {row.missing_profile_fields.length > 0 && (
                    <p className="text-xs text-muted mt-1">
                      Profile: {row.missing_profile_fields.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form onSubmit={saveReminderRule} className="glass rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent grid place-items-center">
              <BellRing size={20} />
            </div>
            <div>
              <h3 className="font-display font-semibold">Reminder / Notification Scheduler</h3>
              <p className="text-xs text-muted mt-1">
                Create reminder rules and run checks manually. Later this can be connected to cron/email.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
              placeholder="Reminder rule name"
              className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
            />
            <select
              value={ruleForm.reminder_type}
              onChange={(e) => setRuleForm({ ...ruleForm, reminder_type: e.target.value })}
              className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
            >
              {REMINDER_TYPES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              value={ruleForm.days_before}
              onChange={(e) => setRuleForm({ ...ruleForm, days_before: e.target.value })}
              placeholder="Days before"
              className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
            />
            <label className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={ruleForm.enabled}
                onChange={(e) => setRuleForm({ ...ruleForm, enabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {ruleForm.id && (
              <button
                type="button"
                onClick={() => setRuleForm({ id: null, name: '', reminder_type: 'expiry', days_before: '30', enabled: true })}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {ruleForm.id ? 'Update Rule' : 'Add Rule'}
            </button>
            <button
              type="button"
              onClick={runReminders}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
              Run Reminder Check & Email
            </button>
          </div>
        </form>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">Reminder Rules</h3>
          {reminderRules.length === 0 ? (
            <EmptyState label="No reminder rules configured yet." />
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {reminderRules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-white/10 bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{rule.name}</p>
                      <p className="text-xs text-muted mt-1">
                        {rule.reminder_type} · {rule.days_before} day(s) before
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Badge tone={rule.enabled ? 'success' : 'default'}>{rule.enabled ? 'enabled' : 'disabled'}</Badge>
                      <button
                        type="button"
                        onClick={() => setRuleForm({
                          id: rule.id,
                          name: rule.name,
                          reminder_type: rule.reminder_type,
                          days_before: String(rule.days_before),
                          enabled: rule.enabled,
                        })}
                        className="rounded-lg border border-white/10 bg-white/5 p-2"
                      >
                        <Save size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReminderRule(rule)}
                        className="rounded-lg border border-rose/20 bg-rose/10 p-2 text-rose"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {reminderResults.length > 0 && (
            <div className="mt-5">
              <h4 className="font-display font-semibold mb-3">Latest Reminder Results</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {reminderResults.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-xl border border-white/10 bg-surface p-3">
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-xs text-muted mt-1">{item.message}</p>
                    {item.employee_name && (
                      <p className="text-[11px] text-muted mt-1">Employee: {item.employee_name}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
