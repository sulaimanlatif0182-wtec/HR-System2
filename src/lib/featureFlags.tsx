import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import apiClient from './api';

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
  'reminder_scheduler',
  'policy_center',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export interface FeatureFlag {
  key: FeatureFlagKey;
  label: string;
  category: string;
  enabled: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlag[] = [
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
  { key: 'reminder_scheduler', label: 'Reminder Scheduler', category: 'Administration', enabled: true },
  { key: 'org_chart', label: 'Org Chart', category: 'Organization', enabled: true },
  { key: 'audit_logs', label: 'Audit Logs', category: 'Administration', enabled: true },
  { key: 'profile_updates', label: 'Profile Updates', category: 'Profile', enabled: true },
  { key: 'employees', label: 'Employee Directory', category: 'Employees', enabled: true },
  { key: 'policy_center', label: 'Policy Center', category: 'Admin Pages', enabled: true },
];

export function flagLabel(key: FeatureFlagKey): string {
  return DEFAULT_FEATURE_FLAGS.find((flag) => flag.key === key)?.label ?? key;
}

interface FeatureFlagsContextValue {
  flags: FeatureFlag[];
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
  const [flags, setFlags] = useState<FeatureFlag[]>(DEFAULT_FEATURE_FLAGS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/employees?feature_flags=true');
      if (!Array.isArray(data)) return;

      const byKey = new Map<string, { key: string; label?: string; category?: string; enabled?: boolean }>(
        data.map((flag) => [flag.key, flag])
      );

      setFlags(
        DEFAULT_FEATURE_FLAGS.map((def) => {
          const row = byKey.get(def.key);
          if (!row) return def;
          return {
            ...def,
            label: row.label || def.label,
            category: row.category || def.category,
            enabled: row.enabled !== false,
          };
        })
      );
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
      return keys.some((flagKey) => {
        const flag = flags.find((item) => item.key === flagKey);
        return !flag || flag.enabled !== false;
      });
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
