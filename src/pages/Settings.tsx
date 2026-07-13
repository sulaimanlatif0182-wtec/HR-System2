import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings as SettingsIcon, User, Bell, Lock, ShieldCheck, Loader2, Check, X,
  CheckCircle2, Mail, LogOut, MonitorSmartphone, CalendarDays, Wallet, UserCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState } from '../components/ui';
import supabase from '../lib/supabase';

const PASSWORD_RULES: Array<{ label: string; test: (p: string) => boolean }> = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)', test: (p) => /[0-9]/.test(p) },
];

const PREFS_KEY = 'wtec-settings-prefs';

interface Prefs {
  emailLeaveUpdates: boolean;
  emailPayslip: boolean;
  emailAnnouncements: boolean;
  weeklySummary: boolean;
}

const DEFAULT_PREFS: Prefs = {
  emailLeaveUpdates: true,
  emailPayslip: true,
  emailAnnouncements: true,
  weeklySummary: false,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_PREFS;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 border ${checked ? 'bg-primary border-primary' : 'bg-white/10 border-white/15'}`}
    >
      <span
        className={`absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

const ROLE_TONE: Record<string, string> = { admin: 'danger', manager: 'warning', employee: 'info' };

export default function Settings() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => { setPrefs(loadPrefs()); }, []);

  const updatePref = (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (!user?.email) return;

    if (!currentPw) {
      setPwError('Please enter your current password.');
      return;
    }
    const failed = PASSWORD_RULES.filter((r) => !r.test(newPw));
    if (failed.length > 0) {
      setPwError('New password does not meet the requirements below.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPw === currentPw) {
      setPwError('New password must be different from the current password.');
      return;
    }

    setSavingPw(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (verifyErr) throw new Error('Current password is incorrect.');

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw updateErr;

      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwSuccess('Password changed successfully.');
      setTimeout(() => setPwSuccess(''), 4000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setSavingPw(false);
    }
  };

  const signOutEverywhere = async () => {
    setSigningOutAll(true);
    try {
      await supabase.auth.signOut({ scope: 'global' });
      navigate('/login');
    } finally {
      setSigningOutAll(false);
    }
  };

  if (loading) return <LoadingState label="Loading settings…" />;

  const role = profile?.role ?? 'employee';
  const inputCls =
    'w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all';

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account, preferences and security." />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 h-fit"
        >
          <div className="flex items-center gap-2 mb-1">
            <User size={17} className="text-primary" />
            <h3 className="font-display font-semibold">Account</h3>
          </div>
          <p className="text-xs text-muted mb-5">Your sign-in identity and access level.</p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 glass rounded-xl px-4 py-3">
              <Mail size={15} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted">Login email</p>
                <p className="text-sm truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 glass rounded-xl px-4 py-3">
              <ShieldCheck size={15} className="text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted">Access level</p>
                <p className="text-sm capitalize">{role}</p>
              </div>
              <Badge tone={ROLE_TONE[role] ?? 'default'}>{role}</Badge>
            </div>
            {profile && (
              <div className="flex items-center gap-3 glass rounded-xl px-4 py-3">
                <UserCircle size={15} className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted">Employee record</p>
                  <p className="text-sm truncate">{profile.name} · {profile.title ?? '—'}</p>
                </div>
                <button
                  onClick={() => navigate('/profile')}
                  className="text-xs text-primary hover:underline underline-offset-2 shrink-0"
                >
                  Edit profile
                </button>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="glass rounded-2xl p-6 h-fit"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Bell size={17} className="text-primary" />
              <h3 className="font-display font-semibold">Notifications</h3>
            </div>
            <AnimatePresence>
              {prefsSaved && (
                <motion.span
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-[11px] text-emerald flex items-center gap-1"
                >
                  <CheckCircle2 size={12} /> Saved
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <p className="text-xs text-muted mb-5">Choose what you want to be notified about.</p>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <CalendarDays size={15} className="text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Leave request updates</p>
                  <p className="text-[11px] text-muted">When your leave is approved or rejected</p>
                </div>
              </div>
              <Toggle checked={prefs.emailLeaveUpdates} onChange={(v) => updatePref('emailLeaveUpdates', v)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Wallet size={15} className="text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Payslip available</p>
                  <p className="text-[11px] text-muted">When a new payslip is processed</p>
                </div>
              </div>
              <Toggle checked={prefs.emailPayslip} onChange={(v) => updatePref('emailPayslip', v)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Bell size={15} className="text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Company announcements</p>
                  <p className="text-[11px] text-muted">News and updates from the organization</p>
                </div>
              </div>
              <Toggle checked={prefs.emailAnnouncements} onChange={(v) => updatePref('emailAnnouncements', v)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <MonitorSmartphone size={15} className="text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Weekly summary</p>
                  <p className="text-[11px] text-muted">A digest of attendance & team activity every Monday</p>
                </div>
              </div>
              <Toggle checked={prefs.weeklySummary} onChange={(v) => updatePref('weeklySummary', v)} />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="glass rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <Lock size={17} className="text-primary" />
            <h3 className="font-display font-semibold">Change Password</h3>
          </div>
          <p className="text-xs text-muted mb-5">You must confirm your current password to set a new one.</p>

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Current password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" className={`${inputCls} pl-10`} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block">New password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1.5 block">Confirm new password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="••••••••" className={`${inputCls} pl-10`} />
                </div>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-3 space-y-1.5">
              <p className="text-[11px] text-muted font-medium mb-1 flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-primary" /> Password requirements
              </p>
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(newPw);
                return (
                  <div key={rule.label} className={`flex items-center gap-2 text-[11px] transition-colors ${ok ? 'text-emerald' : 'text-muted'}`}>
                    {ok ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0 opacity-50" />}
                    {rule.label}
                  </div>
                );
              })}
            </div>

            <AnimatePresence>
              {pwError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2"
                >
                  {pwError}
                </motion.p>
              )}
              {pwSuccess && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-emerald text-xs bg-emerald/10 border border-emerald/20 rounded-lg px-3 py-2"
                >
                  <CheckCircle2 size={14} /> {pwSuccess}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={savingPw}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] transition-all disabled:opacity-60"
            >
              {savingPw ? <Loader2 size={15} className="animate-spin" /> : 'Update password'}
            </button>
          </form>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
          className="glass rounded-2xl p-6 h-fit"
        >
          <div className="flex items-center gap-2 mb-1">
            <SettingsIcon size={17} className="text-primary" />
            <h3 className="font-display font-semibold">Sessions</h3>
          </div>
          <p className="text-xs text-muted mb-5">
            If you signed in on a shared or public computer, you can sign out of all devices at once.
          </p>
          <button
            onClick={signOutEverywhere}
            disabled={signingOutAll}
            className="flex items-center gap-2 rounded-xl bg-rose/10 text-rose border border-rose/25 px-5 py-2.5 text-sm font-semibold hover:bg-rose/20 transition-all disabled:opacity-60"
          >
            {signingOutAll ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
            Sign out of all devices
          </button>
        </motion.div>
      </div>
    </div>
  );
}