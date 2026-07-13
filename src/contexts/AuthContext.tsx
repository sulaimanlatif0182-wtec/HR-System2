import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';

export interface EmployeeProfile {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  department: string | null;
  title: string | null;
  status: string;
  phone: string | null;
  location: string | null;
  join_date: string | null;
  salary: number | null;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: EmployeeProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

function normalizeRole(role: unknown): 'admin' | 'manager' | 'employee' {
  const value = String(role || '').trim().toLowerCase();

  if (value === 'admin') return 'admin';
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
    department: row.department ?? null,
    title: row.title ?? null,
    status: row.status ?? 'active',
    phone: row.phone ?? null,
    location: row.location ?? null,
    join_date: row.join_date ?? null,
    salary: row.salary ?? null,
    avatar_url: row.avatar_url ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

  const refreshProfile = async () => {
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

      setSession(session);
      setUser(session?.user ?? null);

      await loadProfile(session?.user?.email);

      if (mounted) {
        setLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true);

      setSession(session);
      setUser(session?.user ?? null);

      await loadProfile(session?.user?.email);

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);