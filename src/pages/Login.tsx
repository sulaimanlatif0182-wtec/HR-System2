import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import supabase from '../lib/supabase';

type AuthMode = 'signin' | 'forgot';

function getFriendlyAuthError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }

  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }

  if (lower.includes('email rate limit')) {
    return 'Too many emails were requested. Please wait and try again later.';
  }

  if (lower.includes('rate limit')) {
    return 'Too many attempts. Please wait and try again later.';
  }

  if (lower.includes('error sending recovery email')) {
    return 'Unable to send recovery email. Please contact IT support.';
  }

  return message || 'Something went wrong. Please try again.';
}

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        navigate('/', { replace: true });
        return;
      }

      setCheckingSession(false);
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        throw error;
      }

      navigate('/', { replace: true });
    } catch (err) {
      setError(
        getFriendlyAuthError(
          err instanceof Error ? err.message : 'Failed to sign in.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo,
        }
      );

      if (error) {
        throw error;
      }

      setSuccess(
        'If this email exists, a secure password reset link has been sent.'
      );
    } catch (err) {
      setError(
        getFriendlyAuthError(
          err instanceof Error
            ? err.message
            : 'Error sending recovery email.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-bg text-ink grid place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <p className="text-sm text-muted">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(139,92,246,0.22),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.16),transparent_30%)]" />

      <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-[size:64px_64px]" />

      <main className="relative z-10 min-h-screen flex items-center justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <div className="glass-solid rounded-3xl border border-white/10 p-7 sm:p-9 shadow-2xl shadow-black/30">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/30">
                <Sparkles size={22} className="text-white" />
              </div>

              <div>
                <h1 className="font-display text-xl font-bold">WtecHR</h1>
                <p className="text-xs text-muted">
                  Human Resource Management Portal
                </p>
              </div>
            </div>

            {mode === 'signin' ? (
              <>
                <div className="mb-7">
                  <h2 className="font-display text-3xl font-bold">
                    Welcome back
                  </h2>
                  <p className="text-sm text-muted mt-2">
                    Sign in with your company account to continue.
                  </p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="text-xs text-muted mb-1.5 block">
                      Email address
                    </label>

                    <div className="relative">
                      <Mail
                        size={17}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                      />

                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="w-full bg-surface border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted mb-1.5 block">
                      Password
                    </label>

                    <div className="relative">
                      <Lock
                        size={17}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                      />

                      <input
                        required
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-surface border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose/20 bg-rose/10 px-3 py-2.5 text-sm text-rose">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {success && (
                    <div className="flex items-start gap-2 rounded-xl border border-emerald/20 bg-emerald/10 px-3 py-2.5 text-sm text-emerald">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      <span>{success}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <>
                        Sign in
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setSuccess('');
                  }}
                  className="w-full mt-5 text-sm text-muted hover:text-primary transition-all"
                >
                  Forgot your password?
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError('');
                    setSuccess('');
                  }}
                  className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink mb-6 transition-all"
                >
                  <ArrowLeft size={16} />
                  Back to sign in
                </button>

                <div className="mb-7">
                  <h2 className="font-display text-3xl font-bold">
                    Reset your password
                  </h2>
                  <p className="text-sm text-muted mt-2">
                    Enter the email linked to your account and we’ll send you a
                    secure link to set a new password.
                  </p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="text-xs text-muted mb-1.5 block">
                      Email address
                    </label>

                    <div className="relative">
                      <Mail
                        size={17}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                      />

                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="w-full bg-surface border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-rose/20 bg-rose/10 px-3 py-2.5 text-sm text-rose">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {success && (
                    <div className="flex items-start gap-2 rounded-xl border border-emerald/20 bg-emerald/10 px-3 py-2.5 text-sm text-emerald">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      <span>{success}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <>
                        Send reset link
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>

                <p className="text-xs text-muted text-center mt-5">
                  Need help? it1@wtecgroup.com.my
                </p>
              </>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}