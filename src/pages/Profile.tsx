import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Phone, MapPin, Briefcase, Calendar, ShieldCheck, Lock,
  Loader2, Check, X, CheckCircle2, Building2,
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

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

const ROLE_TONE: Record<string, string> = { admin: 'danger', manager: 'warning', employee: 'info' };

export default function Profile() {
  const { user, profile, loading, refreshProfile } = useAuth();

  // Profile info form
  const [form, setForm] = useState({ name: '', title: '', phone: '', location: '', department: '' });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoSuccess, setInfoSuccess] = useState('');

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? '',
        title: profile.title ?? '',
        phone: profile.phone ?? '',
        location: profile.location ?? '',
        department: profile.department ?? '',
      });
    }
  }, [profile]);

  const saveInfo = async (e: FormEvent) => {
    e.preventDefault();
    setInfoError('');
    setInfoSuccess('');
    if (!profile) return;
    if (!form.name.trim()) {
      setInfoError('Name cannot be empty.');
      return;
    }
    setSavingInfo(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profile.id,
          name: form.name.trim(),
          title: form.title.trim() || null,
          phone: form.phone.trim() || null,
          location: form.location.trim() || null,
          department: form.department.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save profile.');
      }
      await refreshProfile();
      setInfoSuccess('Profile updated successfully.');
      setTimeout(() => setInfoSuccess(''), 4000);
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSavingInfo(false);
    }
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
      // Verify current password first (re-authentication)
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

  if (loading) return <LoadingState label="Loading profile…" />;

  const displayName = profile?.name ?? user?.email?.split('@')[0] ?? 'User';
  const role = profile?.role ?? 'employee';

  const inputCls =
    'w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all';

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Manage your personal information and account security." />

      {/* Identity card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center gap-5"
      >
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center text-2xl font-bold shadow-xl shadow-primary/30 shrink-0">
          {initials(displayName)}
        </div>
        <div className="text-center sm:text-left">
          <h2 className="font-display text-xl font-bold">{displayName}</h2>
          <p className="text-muted text-sm mt-0.5 flex items-center gap-1.5 justify-center sm:justify-start">
            <Mail size={13} /> {user?.email}
          </p>
          <div className="flex gap-2 mt-2 justify-center sm:justify-start">
            <Badge tone={ROLE_TONE[role] ?? 'default'}>
              <ShieldCheck size={11} /> {role}
            </Badge>
            {profile?.department && <Badge tone="info">{profile.department}</Badge>}
            {profile?.join_date && (
              <Badge tone="default">
                <Calendar size={11} /> Joined {profile.join_date}
              </Badge>
            )}
          </div>
        </div>
      </motion.div>

      {!profile && (
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-amber text-xs bg-amber/10 border border-amber/20 rounded-xl px-4 py-3 mb-6"
        >
          Your account email is not linked to an employee record in the directory, so profile details cannot
          be edited. You can still change your password below.
        </motion.p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Personal information */}
        {profile && (
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex items-center gap-2 mb-1">
              <User size={17} className="text-primary" />
              <h3 className="font-display font-semibold">Personal Information</h3>
            </div>
            <p className="text-xs text-muted mb-5">These details appear across the portal (directory, org chart, approvals).</p>

            <form onSubmit={saveInfo} className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block">Full name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted mb-1.5 block">Job title</label>
                  <div className="relative">
                    <Briefcase size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${inputCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1.5 block">Department</label>
                  <div className="relative">
                    <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={`${inputCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1.5 block">Phone</label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${inputCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1.5 block">Location</label>
                  <div className="relative">
                    <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={`${inputCls} pl-10`} />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Email (login) — cannot be changed here</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={user?.email ?? ''} disabled className={`${inputCls} pl-10 opacity-50 cursor-not-allowed`} />
                </div>
              </div>

              <AnimatePresence>
                {infoError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2"
                  >
                    {infoError}
                  </motion.p>
                )}
                {infoSuccess && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 text-emerald text-xs bg-emerald/10 border border-emerald/20 rounded-lg px-3 py-2"
                  >
                    <CheckCircle2 size={14} /> {infoSuccess}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={savingInfo}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] transition-all disabled:opacity-60"
              >
                {savingInfo ? <Loader2 size={15} className="animate-spin" /> : 'Save changes'}
              </button>
            </form>
          </motion.div>
        )}

        {/* Change password */}
        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="glass rounded-2xl p-6 h-fit"
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
              className="flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/10 transition-all disabled:opacity-60"
            >
              {savingPw ? <Loader2 size={15} className="animate-spin" /> : 'Update password'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}