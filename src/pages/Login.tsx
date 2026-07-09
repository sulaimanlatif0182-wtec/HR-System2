import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Users, UserCircle2, Mail, Lock, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';

const demoAccounts = [
  { role: 'Admin', email: 'admin@hrsystem.com', password: 'admin123', icon: ShieldCheck, desc: 'Full access', grad: 'from-fuchsia-500 to-violet-600' },
  { role: 'Manager', email: 'manager@hrsystem.com', password: 'manager123', icon: Users, desc: 'Team access', grad: 'from-cyan-400 to-blue-600' },
  { role: 'Employee', email: 'employee@hrsystem.com', password: 'employee123', icon: UserCircle2, desc: 'Self service', grad: 'from-amber-400 to-orange-500' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) throw error;
    navigate('/');
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        navigate('/');
      } else {
        await doLogin(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async (role: string, demoEmail: string, demoPassword: string) => {
    setDemoLoading(role);
    setError('');
    try {
      await doLogin(demoEmail, demoPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-ink flex items-center justify-center px-4 py-10">
      {/* Ambient background */}
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
        {/* Left brand panel */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="hidden lg:flex flex-col gap-8 pr-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/30">
              <Sparkles size={22} className="text-white" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">Nimbus<span className="text-gradient">HR</span></span>
          </div>
          <div>
            <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-tight">
              People operations,<br />
              <span className="text-gradient">reimagined.</span>
            </h1>
            <p className="mt-5 text-muted text-lg max-w-md leading-relaxed">
              A unified command center for headcount, attendance, payroll &amp; performance — built for teams that move fast.
            </p>
          </div>
          <div className="flex gap-6 pt-4">
            {[['3.2k+', 'Employees managed'], ['99.9%', 'Uptime SLA'], ['48', 'Countries']].map(([n, l]) => (
              <div key={l}>
                <div className="font-display text-2xl font-bold text-gradient">{n}</div>
                <div className="text-xs text-muted mt-1">{l}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right auth card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          className="glass rounded-3xl p-7 sm:p-9 shadow-2xl shadow-black/40"
        >
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="font-display text-xl font-bold">Nimbus<span className="text-gradient">HR</span></span>
          </div>

          <h2 className="font-display text-2xl font-bold">Welcome back</h2>
          <p className="text-muted text-sm mt-1">Sign in to your HR command center</p>

          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-widest text-muted font-mono mb-3">Quick demo access</p>
            <div className="grid grid-cols-3 gap-2.5">
              {demoAccounts.map((d) => {
                const Icon = d.icon;
                const isLoadingThis = demoLoading === d.role;
                return (
                  <button
                    key={d.role}
                    onClick={() => handleDemo(d.role, d.email, d.password)}
                    disabled={!!demoLoading}
                    className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] py-3 px-2 hover:bg-white/[0.07] hover:border-white/20 transition-all disabled:opacity-60"
                  >
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${d.grad} grid place-items-center shadow-md group-hover:scale-110 transition-transform`}>
                      {isLoadingThis ? <Loader2 size={16} className="text-white animate-spin" /> : <Icon size={16} className="text-white" />}
                    </div>
                    <span className="text-xs font-semibold">{d.role}</span>
                    <span className="text-[10px] text-muted">{d.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] text-muted font-mono uppercase tracking-widest">or login manually</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
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

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between text-xs text-muted">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="accent-[#8b5cf6]" />
                Remember me
              </label>
              <button type="button" className="hover:text-ink transition-colors">Forgot password?</button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>{isSignUp ? 'Create account' : 'Sign in'} <ArrowRight size={16} /></>}
            </button>
          </form>

          <button
            onClick={() => signInWithGoogle('NimbusHR')}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-sm font-medium hover:bg-white/[0.08] transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.3-.97 2.4-2.06 3.14v2.6h3.34c1.96-1.8 3.1-4.46 3.1-7.6 0-.74-.07-1.45-.19-2.14H12Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.34-2.6c-.93.62-2.12.98-3.28.98-2.52 0-4.66-1.7-5.42-4H3.13v2.56C4.78 19.6 8.13 22 12 22Z"/><path fill="#4A90E2" d="M6.58 13.96A5.9 5.9 0 0 1 6.26 12c0-.68.12-1.34.32-1.96V7.48H3.13A9.98 9.98 0 0 0 2 12c0 1.6.38 3.12 1.13 4.52l3.45-2.56Z"/><path fill="#FBBC05" d="M12 6.02c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.96 2.98 14.7 2 12 2 8.13 2 4.78 4.4 3.13 7.48l3.45 2.56c.76-2.3 2.9-4.02 5.42-4.02Z"/></svg>
            Continue with Google
          </button>

          <p className="text-center text-xs text-muted mt-6">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => setIsSignUp(!isSignUp)} className="text-ink font-medium hover:text-gradient underline underline-offset-2">
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
          <p className="text-center text-[11px] text-muted/70 mt-3">
            Need help? <span className="text-muted">support@nimbushr.com</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
