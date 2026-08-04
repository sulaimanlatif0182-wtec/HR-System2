import supabase from './db-client.js';

export const DEFAULT_FEATURE_FLAGS = {
  leave_request: true,
  leave_approval: true,
  claims_request: true,
  claims_approval: true,
  attendance: true,
  payroll: true,
  announcements: true,
  hr_letters: true,
  performance: true,
  monthly_reports: true,
  backup: true,
  system_health: true,
  org_chart: true,
  audit_logs: true,
  profile_updates: true,
  employees: true,
};

function toBoolean(value) {
  return value === true || value === 1 || value === 'true';
}

export async function getFeatureFlags() {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, enabled');

  if (error) return { ...DEFAULT_FEATURE_FLAGS };

  const flags = { ...DEFAULT_FEATURE_FLAGS };

  (data || []).forEach((row) => {
    if (row && row.key && Object.prototype.hasOwnProperty.call(flags, row.key)) {
      flags[row.key] = toBoolean(row.enabled);
    }
  });

  return flags;
}

export async function isFeatureEnabled(key) {
  const flags = await getFeatureFlags();
  return flags[key] !== false;
}

export async function saveFeatureFlags(flags = {}, actor = {}) {
  const cleanFlags = { ...DEFAULT_FEATURE_FLAGS };

  Object.keys(cleanFlags).forEach((flagKey) => {
    if (Object.prototype.hasOwnProperty.call(flags || {}, flagKey)) {
      cleanFlags[flagKey] = toBoolean(flags[flagKey]);
    }
  });

  const rows = Object.entries(cleanFlags).map(([key, enabled]) => ({
    key,
    enabled,
    updated_by: actor.changed_by || null,
    updated_by_name: actor.changed_by_name || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('feature_flags')
    .upsert(rows, { onConflict: 'key' });

  if (error) throw error;

  return cleanFlags;
}
