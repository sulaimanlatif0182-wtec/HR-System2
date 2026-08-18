/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import {
  normalizeProfile,
  type EmployeeProfile,
} from '../lib/profile';

type AuthMode = 'supabase' | 'worker';

// Worker kiosk auth uses an httpOnly, Secure, SameSite=Strict cookie set by the
// API (api/auth/worker-login.js). The token is never exposed to JavaScript,
// removing the XSS risk of storing it in localStorage.
const WORKER_LOGIN_PATH = '/api/auth/worker-login';

async function clearWorkerCookie() {
  try {
    await fetch(WORKER_LOGIN_PATH, { method: 'DELETE' });
  } catch {
    // Ignore network errors when clearing the worker cookie.
  }
}

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

// Profile normalization lives in src/lib/profile.ts (typed + unit-tested).

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('supabase');
  const authInitialized = useRef(false);

  const loadProfile = async (email: string | undefined) => {
    if (!email) {
      setProfile(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const res = await fetch(
        `/api/employees?email=${encodeURIComponent(cleanEmail)}&t=${Date.now()}`,
        {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
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
    } finally {
      clearTimeout(timer);
    }
  };

  const restoreWorkerSession = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(WORKER_LOGIN_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.employee) {
        const employeeProfile = normalizeProfile(data.employee);

        if (!employeeProfile) return;

        setProfile(employeeProfile);
        setAuthMode('worker');
      }
    } catch {
      // No active worker session; ignore.
    } finally {
      clearTimeout(timer);
    }
  };

  const refreshProfile = async () => {
    if (authMode === 'worker') {
      await restoreWorkerSession();
      return;
    }

    await loadProfile(user?.email);
  };

  useEffect(() => {
    let mounted = true;

  const initAuth = async () => {
    setLoading(true);

    try {
      // getSession can hang when the gotrue auth-token lock is orphaned;
      // bound it and assume signed-out on timeout so we never stick on "loading".
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 6000)
        ),
      ]);

      if (!mounted) return;

      const session = result?.data?.session;

      if (session) {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthMode('supabase');
        await loadProfile(session?.user?.email);
      } else {
        await restoreWorkerSession();
      }
    } catch (err) {
      console.error('initAuth failed:', err);
    } finally {
      if (mounted) setLoading(false);
      authInitialized.current = true;
    }
  };

  initAuth();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    // During initial auth, initAuth() manages the loading state.
    // Only reset loading for subsequent auth events (sign-in, sign-out, token refresh).
    if (!authInitialized.current) return;

    setLoading(true);

    try {
      if (session) {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthMode('supabase');
        clearWorkerCookie();
        await loadProfile(session?.user?.email);
      } else {
        setSession(null);
        setUser(null);
        await restoreWorkerSession();
      }
    } catch (err) {
      console.error('auth state change failed:', err);
    } finally {
      setLoading(false);
    }
  });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInAsWorker = async (employeeNo: string) => {
    const res = await fetch(WORKER_LOGIN_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_no: employeeNo }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || 'Unable to sign in with this ID.');
    }

    const employeeProfile = normalizeProfile(data.employee);

    if (!employeeProfile) {
      throw new Error('Unable to load worker profile.');
    }

    setUser(null);
    setSession(null);
    setProfile(employeeProfile);
    setAuthMode('worker');

    return employeeProfile;
  };

  const signOut = async () => {
    try {
      if (authMode === 'worker') {
        await clearWorkerCookie();
        return;
      }

      try {
        // The gotrue auth-token lock can be orphaned (React Strict Mode /
        // in-flight token refresh), so signOut may hang until gotrue force
        // recovers the lock (~5s). Allow a longer window so it completes and
        // properly clears the session instead of timing out early.
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('signOut timed out')), 10000)
          ),
        ]);
      } catch (err) {
        console.error('signOut (global) failed, clearing local session:', err);
        try {
          await Promise.race([
            supabase.auth.signOut({ scope: 'local' }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('local signOut timed out')), 5000)
            ),
          ]);
        } catch {
          // Ignore — local state is cleared in finally regardless.
        }
      }
    } catch (err) {
      console.error('signOut failed:', err);
    } finally {
      setProfile(null);
      setUser(null);
      setSession(null);
      setAuthMode('supabase');
      setLoading(false);
    }
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
