import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Lock, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import supabase from '../lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (session) setSessionReady(true);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionReady(true);
        setChecking(false);
      }
    });
    const t = setTimeout(() => setChecking(false), 4000);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setTimeout(() => navigate('/'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-ink flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 grid-noise opacity-40" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-primary/30 blur-[140px]" />
      <div className="absolute -bottom-40 -right-20 w-[480px] h-[480px] rounded-full bg-accent/20 blur-[140px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 glass rounded-3xl p-7 sm:p-9 shadow-2xl shadow-black/40 w-full max-w-md"
      >
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <span className="font-display text-xl font-bold">
            Wtec<span className="text-gradient">HR</span>
          </span>
        </div>

        {done ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald/15 border border-emerald/25 grid place-items-center mx-auto mb-4">
              <CheckCircle2 size={26} className="text-emerald" />
            </div>
            <h2 className="font-display text-xl font-bold">Password updated</h2>
            <p className="text-muted text-sm mt-2">You're signed in. Redirecting you to the dashboard…</p>
          </motion.div>
        ) : checking ? (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-muted text-sm">Verifying reset link…</p>
          </div>
        ) : !sessionReady ? (
          <div className="text-center py-6">
            <h2 className="font-display text-xl font-bold mb-2">Link expired or invalid</h2>
            <p className="text-muted text-sm mb-6">
              This password reset link is no longer valid. Please request a new one from the sign-in page.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="rounded-xl bg-gradient-to-r from-primary to-primary-2 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={18} className="text-primary" />
              <h2 className="font-display text-xl font-bold">Set a new password</h2>
            </div>
            <p className="text-muted text-sm mb-6">Choose a strong password for your WtecHR account.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block">New password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1.5 block">Confirm password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : 'Update password'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}