import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import type { Employee } from '../types';

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
  profile: Employee | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (email: string | undefined) => {
    if (!email) {
      setProfile(null);
      return;
    }
    try {
      const res = await fetch(`/api/employees?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setProfile(data[0]);
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    await loadProfile(user?.email);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: any } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      await loadProfile(session?.user?.email);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      await loadProfile(session?.user?.email);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
