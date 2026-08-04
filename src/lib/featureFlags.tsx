import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export const FEATURE_FLAG_KEYS = [
  'leave_request',
  'leave_approval',
  'claims_request',
  'claims_approval',
  'attendance',
  'payroll',
  'announcements',
  'hr_letters',
  'performance',
  'monthly_reports',
  'backup',
  'system_health',
  'org_chart',
  'audit_logs',
  'profile_updates',
  'employees',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.fromEntries(
  FEATURE_FLAG_KEYS.map((key) => [key, true])
) as FeatureFlags;

const FLAG_LABELS: Record<FeatureFlagKey, string> = {
  leave_request: 'Leave Requests',
  leave_approval: 'Leave Approvals',
  claims_request: 'Claims Submission',
  claims_approval: 'Claims Approvals',
  attendance: 'Attendance',
  payroll: 'Payroll',
  announcements: 'Announcements',
  hr_letters: 'HR Letters',
  performance: 'Performance Reviews',
  monthly_reports: 'Monthly Reports',
  backup: 'Backup Center',
  system_health: 'System Health',
  org_chart: 'Org Chart',
  audit_logs: 'Audit Logs',
  profile_updates: 'Profile Updates',
  employees: 'Employee Directory',
};

export function flagLabel(key: FeatureFlagKey): string {
  return FLAG_LABELS[key] ?? key;
}

interface FeatureFlagsContextValue {
  flags: FeatureFlags;
  loaded: boolean;
  isEnabled: (key: FeatureFlagKey | FeatureFlagKey[]) => boolean;
  refresh: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: DEFAULT_FEATURE_FLAGS,
  loaded: false,
  isEnabled: () => true,
  refresh: async () => {},
});

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?feature_flags=true');
      if (!res.ok) return;
      const data = await res.json();
      setFlags({ ...DEFAULT_FEATURE_FLAGS, ...(data || {}) });
    } catch {
      // keep defaults (all enabled) on failure
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isEnabled = useCallback(
    (key: FeatureFlagKey | FeatureFlagKey[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return keys.some((flagKey) => flags[flagKey] !== false);
    },
    [flags]
  );

  const value = useMemo(
    () => ({ flags, loaded, isEnabled, refresh }),
    [flags, loaded, isEnabled, refresh]
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
