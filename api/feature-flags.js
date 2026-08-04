import supabase from './db-client.js';

export const DEFAULT_FEATURE_FLAGS = [
  { key: 'leave_request', label: 'Leave Requests', category: 'Leave', enabled: true },
  { key: 'leave_approval', label: 'Leave Approvals', category: 'Leave', enabled: true },
  { key: 'claims_request', label: 'Claims Submission', category: 'Claims', enabled: true },
  { key: 'claims_approval', label: 'Claims Approvals', category: 'Claims', enabled: true },
  { key: 'attendance', label: 'Attendance', category: 'Attendance', enabled: true },
  { key: 'payroll', label: 'Payroll', category: 'Payroll', enabled: true },
  { key: 'announcements', label: 'Announcements', category: 'Communication', enabled: true },
  { key: 'hr_letters', label: 'HR Letters', category: 'HR Documents', enabled: true },
  { key: 'performance', label: 'Performance Reviews', category: 'Performance', enabled: true },
  { key: 'monthly_reports', label: 'Monthly Reports', category: 'Reports', enabled: true },
  { key: 'backup', label: 'Backup Center', category: 'Administration', enabled: true },
  { key: 'system_health', label: 'System Health', category: 'Administration', enabled: true },
  { key: 'org_chart', label: 'Org Chart', category: 'Organization', enabled: true },
  { key: 'audit_logs', label: 'Audit Logs', category: 'Administration', enabled: true },
  { key: 'profile_updates', label: 'Profile Updates', category: 'Profile', enabled: true },
  { key: 'employees', label: 'Employee Directory', category: 'Employees', enabled: true },
];

export function defaultFlag(key) {
  return DEFAULT_FEATURE_FLAGS.find((flag) => flag.key === key);
}

function toBoolean(value) {
  return value === true || value === 1 || value === 'true';
}

export async function getFeatureFlags() {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, label, category, enabled');

  const merged = DEFAULT_FEATURE_FLAGS.map((flag) => ({ ...flag, enabled: true }));

  if (!error && Array.isArray(data)) {
    const byKey = new Map(data.map((row) => [row.key, row]));

    merged.forEach((flag) => {
      const row = byKey.get(flag.key);
      if (row) {
        flag.label = row.label || flag.label;
        flag.category = row.category || flag.category;
        flag.enabled = toBoolean(row.enabled);
      }
    });
  }

  return merged.sort(
    (a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label)
  );
}

export async function isFeatureEnabled(key) {
  const flags = await getFeatureFlags();
  const flag = flags.find((item) => item.key === key);
  return !flag || flag.enabled !== false;
}

export async function saveFeatureFlag(flag = {}, actor = {}) {
  const key = String(flag.key || '').trim();
  const def = defaultFlag(key);

  if (!def) {
    throw new Error(`Unknown feature flag key: ${key || '(empty)'}`);
  }

  const row = {
    key: def.key,
    label: flag.label || def.label,
    category: flag.category || def.category,
    enabled: toBoolean(flag.enabled),
    updated_by: actor.changed_by || null,
    updated_by_name: actor.changed_by_name || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('feature_flags')
    .upsert(row, { onConflict: 'key' })
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error(`Failed to save feature flag: ${key}`);

  return data;
}

export async function saveFeatureFlags(flags = [], actor = {}) {
  const results = [];

  for (const flag of flags) {
    if (!flag || !flag.key) continue;
    results.push(await saveFeatureFlag(flag, actor));
  }

  return results;
}
