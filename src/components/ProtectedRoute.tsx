import type { ReactNode } from 'react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { profile, session, loading, refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <p className="text-muted text-sm font-mono tracking-wide">loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!profile && !session) return <Navigate to="/login" replace />;

  if (!profile) {
    // A session exists but the employee profile failed to load (API hiccup
    // or the login email has no employees-table row). Redirecting to /login
    // here would bounce straight back, since Login redirects sessions home —
    // show a retry screen instead of an infinite loop.
    const retry = async () => {
      setRetrying(true);
      try {
        await refreshProfile();
      } finally {
        setRetrying(false);
      }
    };
    const quit = async () => {
      setSigningOut(true);
      try {
        await signOut();
      } finally {
        setSigningOut(false);
      }
    };
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg p-6">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <h1 className="font-display text-xl font-bold">Couldn&apos;t load your profile</h1>
          <p className="text-muted mt-2 text-sm">
            You&apos;re signed in, but your employee record didn&apos;t load. Check your
            connection, or ask HR to confirm your login email is registered — then try again.
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={quit}
              disabled={signingOut}
              className="px-4 py-2 rounded-xl border border-line text-sm font-semibold disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
