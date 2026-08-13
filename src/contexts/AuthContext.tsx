import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import type { EmployeeCategory } from '../types';

export interface EmployeeProfile {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  category: EmployeeCategory;
  department: string | null;
  title: string | null;
  status: string;
  phone: string | null;
  location: string | null;
  join_date: string | null;
  salary: number | null;
  avatar_url: string | null;
  employee_no: string | null;
}

type AuthMode = 'supabase' | 'worker';

interface WorkerSessionPayload {
  token: string;
  employee: EmployeeProfile;
}

const WORKER_SESSION_KEY = 'wtechr_worker_session';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: EmployeeProfile | null;
  loading: boolean;
  authMode: AuthMode;
  signInAsWorker: (employeeNo: string) => Promise<EmployeeProfile>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  authMode: 'supabase',
  signInAsWorker: async () => {
    throw new Error('Auth provider not ready.');
  },
  signOut: async () => {},
  refreshProfile: async () => {},
});

function normalizeRole(role: unknown): 'admin' | 'manager' | 'employee' {
  const value = String(role || '').trim().toLowerCase();

  if (value === 'admin') return 'admin';
  if (value === 'manager') return 'manager';

  return 'employee';
}

function normalizeCategory(category: unknown): EmployeeCategory {
  const value = String(category || '').trim().toLowerCase();

  if (value === 'worker') return 'worker';
  if (value === 'manager') return 'manager';

  return 'employee';
}

function normalizeProfile(data: any): EmployeeProfile | null {
  if (!data) return null;

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) return null;

  return {
    id: Number(row.id),
    name: row.name ?? '',
    email: row.email ?? '',
    role: normalizeRole(row.role),
    category: normalizeCategory(row.category),
    department: row.department ?? null,
    title: row.title ?? null,
    status: row.status ?? 'active',
    phone: row.phone ?? null,
    location: row.location ?? null,
    join_date: row.join_date ?? null,
    salary: row.salary ?? null,
    avatar_url: row.avatar_url ?? null,
    employee_no: row.employee_no ?? null,
  };
}

function readStoredWorkerSession(): WorkerSessionPayload | null {
  try {
    const raw = localStorage.getItem(WORKER_SESSION_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as WorkerSessionPayload;

    if (!parsed?.token || !parsed?.employee?.id) return null;

    return parsed;
  } catch {
    return null;
  }
}

function storeWorkerSession(payload: WorkerSessionPayload) {
  try {
    localStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

function clearWorkerSession() {
  try {
    localStorage.removeItem(WORKER_SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('supabase');

  const loadProfile = async (email: string | undefined) => {
    if (!email) {
      setProfile(null);
      return;
    }

    try {
      const cleanEmail = email.trim().toLowerCase();

      const res = await fetch(
        `/api/employees?email=${encodeURIComponent(cleanEmail)}&t=${Date.now()}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      );

      if (!res.ok) {
        throw new Error('Failed to load employee profile.');
      }

      const data = await res.json();
      const employeeProfile = normalizeProfile(data);

      setProfile(employeeProfile);
    } catch {
      setProfile(null);
    }
  };

  const restoreWorkerSession = async () => {
    const stored = readStoredWorkerSession();

    if (!stored) return;

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'worker_session', token: stored.token }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.employee) {
        const employeeProfile = normalizeProfile(data.employee);

        if (!employeeProfile) {
          clearWorkerSession();
          return;
        }

        storeWorkerSession({ token: stored.token, employee: employeeProfile });
        setProfile(employeeProfile);
        setAuthMode('worker');
      } else {
        clearWorkerSession();
      }
    } catch {
      clearWorkerSession();
    }
  };

  const refreshProfile = async () => {
    if (authMode === 'worker') {
      const stored = readStoredWorkerSession();
      if (stored) setProfile(stored.employee);
      return;
    }

    await loadProfile(user?.email);
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthMode('supabase');
        await loadProfile(session?.user?.email);
      } else {
        await restoreWorkerSession();
      }

      if (mounted) {
        setLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true);

      if (session) {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthMode('supabase');
        clearWorkerSession();
        await loadProfile(session?.user?.email);
      } else {
        setSession(null);
        setUser(null);
        await restoreWorkerSession();
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInAsWorker = async (employeeNo: string) => {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'worker_login', employee_no: employeeNo }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || 'Unable to sign in with this ID.');
    }

    const employeeProfile = normalizeProfile(data.employee);

    if (!employeeProfile) {
      throw new Error('Unable to load worker profile.');
    }

    storeWorkerSession({ token: data.token, employee: employeeProfile });

    setUser(null);
    setSession(null);
    setProfile(employeeProfile);
    setAuthMode('worker');

    return employeeProfile;
  };

  const signOut = async () => {
    if (authMode === 'worker') {
      clearWorkerSession();
      setProfile(null);
      setUser(null);
      setSession(null);
      return;
    }

    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        authMode,
        signInAsWorker,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
