import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Mail, Lock, ArrowRight, Loader2, ArrowLeft, CheckCircle2, Check, X, ShieldCheck } from 'lucide-react';
import supabase, { REMEMBER_KEY, REMEMBERED_EMAIL_KEY } from '../lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot';

const PASSWORD_RULES: Array<{ label: string; test: (p: string) => boolean }> = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)', test: (p) => /[0-9]/.test(p) },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [stats, setStats] = useState({ employees: 0, departments: 0, locations: 0 });
  const navigate = useNavigate();

  // Restore "remember me" preference + remembered email
  useEffect(() => {
    const pref = localStorage.getItem(REMEMBER_KEY);
    if (pref === 'false') setRemember(false);
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedEmail) setEmail(savedEmail);
  }, []);

  useEffect(() => {
    fetch('/api/employees')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          const locs = new Set(d.map((e) => e.location).filter(Boolean));
          setStats((s) => ({ ...s, employees: d.length, locations: locs.size }));
        }
      })
      .catch(() => {});
    fetch('/api/departments')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setStats((s) => ({ ...s, departments: d.length }));
      })
      .catch(() => {});
  }, []);

  const applyRememberChoice = (value: boolean) => {
    setRemember(value);
    localStorage.setItem(REMEMBER_KEY, String(value));
  };

  const persistRemembered = () => {
    localStorage.setItem(REMEMBER_KEY, String(remember));
    if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'forgot') {
      if (!email) {
        setError('Please enter your email address.');
        return;
      }
      setBusy(true);
      try {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setNotice(`Password reset link sent to ${email}. Check your inbox (and spam folder), then follow the link to set a new password.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send reset email.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }
    setBusy(true);
    try {
      persistRemembered();
          if (mode === 'signup') {
      const failed = PASSWORD_RULES.filter((r) => !r.test(password));
      if (failed.length > 0) {
        setError('Password does not meet the requirements below.');
        return;
      }
    }
    setBusy(true);
    try {
      persistRemembered();
      if (mode === 'signup') {
        // Secure registration: server verifies the email exists in the
        // employee directory (added by admin) before creating the account.
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Registration failed.');
        // Account created — sign them straight in
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate('/');
      } else {
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const statItems: Array<[string, string]> = [
    [stats.employees > 0 ? `${stats.employees}` : '—', 'Employees managed'],
    [stats.departments > 0 ? `${stats.departments}` : '—', 'Departments'],
    [stats.locations > 0 ? `${stats.locations}` : '—', 'Locations'],
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-ink flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 grid-noise opacity-40" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-primary/30 blur-[140px]" />
      <div className="absolute -bottom-40 -right-20 w-[480px] h-[480px] rounded-full bg-accent/20 blur-[140px]" />
      <motion.div
        className="absolute top-1/4 right-1/4 w-24 h-24 rounded-3xl glass animate-float-slow hidden lg:block"
        initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ delay: 0.4, duration: 1 }}
      />
      <motion.div
        className="absolute bottom-1/4 left-1/3 w-16 h-16 rounded-2xl glass hidden lg:block"
        style={{ animationDelay: '1.5s' }}
        initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.7, duration: 1 }}
      />

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[1.05fr_1fr] gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="hidden lg:flex flex-col gap-8 pr-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/30">
              <Sparkles size={22} className="text-white" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">
              Wtec<span className="text-gradient">HR</span>
            </span>
          </div>
          <div>
            <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-tight">
              People operations,<br />
              <span className="text-gradient">reimagined.</span>
            </h1>
            <p className="mt-5 text-muted text-lg max-w-md leading-relaxed">
              A unified command center for headcount, attendance, payroll & performance — built for teams that move fast.
            </p>
          </div>
          <div className="flex gap-6 pt-4">
            {statItems.map(([value, label]) => (
              <div key={label}>
                <div className="font-display text-2xl font-bold text-gradient">{value}</div>
                <div className="text-xs text-muted mt-1">{label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          className="glass rounded-3xl p-7 sm:p-9 shadow-2xl shadow-black/40"
        >
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="font-display text-xl font-bold">
              Wtec<span className="text-gradient">HR</span>
            </span>
          </div>

          {mode === 'forgot' ? (
            <>
              <button
                onClick={() => { setMode('signin'); setError(''); setNotice(''); }}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors mb-4"
              >
                <ArrowLeft size={13} /> Back to sign in
              </button>
              <h2 className="font-display text-2xl font-bold mb-2">Reset your password</h2>
              <p className="text-muted text-sm mb-6">
                Enter the email linked to your account and we'll send you a secure link to set a new password.
              </p>
            </>
          ) : (
            <h2 className="font-display text-2xl font-bold mb-6">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h2>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="text-xs text-muted mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
            )}
            {mode === 'signup' && (
              <div className="bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-3 space-y-1.5">
                <p className="text-[11px] text-muted font-medium mb-1 flex items-center gap-1.5">
                  <ShieldCheck size={12} className="text-primary" /> Password requirements
                </p>
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <div key={rule.label} className={`flex items-center gap-2 text-[11px] transition-colors ${ok ? 'text-emerald' : 'text-muted'}`}>
                      {ok ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0 opacity-50" />}
                      {rule.label}
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted/70 pt-1 border-t border-white/5 mt-2">
                  Note: sign-up is only available for email addresses registered in the employee directory by your administrator.
                </p>
              </div>
            )}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
              {notice && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 text-emerald text-xs bg-emerald/10 border border-emerald/20 rounded-lg px-3 py-2"
                >
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                  <span>{notice}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {mode === 'signin' && (
              <div className="flex items-center justify-between text-xs text-muted">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => applyRememberChoice(e.target.checked)}
                    className="accent-[#8b5cf6]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}
                  className="hover:text-ink transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  {mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}{' '}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {mode !== 'forgot' && (
            <p className="text-center text-xs text-muted mt-6">
              {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setNotice(''); }}
                className="text-ink font-medium hover:text-gradient underline underline-offset-2"
              >
                {mode === 'signup' ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          )}
          <p className="text-center text-[11px] text-muted/70 mt-3">
            Need help? <span className="text-muted">it1@wtecgroup.com.my</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}