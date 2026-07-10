import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/ui';

export default function Settings() {
  const { user, profile } = useAuth();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account, preferences and security." />
      <div className="glass rounded-2xl p-6">
        <p className="text-sm">Logged in as: {user?.email}</p>
        <p className="text-sm text-muted mt-2">Role: {profile?.role ?? 'unknown'}</p>
        <p className="text-sm text-emerald mt-4">✓ Settings page is rendering correctly!</p>
      </div>
    </div>
  );
}