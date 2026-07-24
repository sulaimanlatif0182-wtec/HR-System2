import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Megaphone,
  Plus,
  Save,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/ui';

interface Announcement {
  id: number;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  expires_at?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

const EMPTY_FORM = {
  id: null as number | null,
  title: '',
  body: '',
  category: 'General',
  pinned: false,
  expires_at: '',
};

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString();
}

function isExpired(item: Announcement) {
  if (!item.expires_at) return false;

  return String(item.expires_at).slice(0, 10) < formatLocalDate();
}

export default function Announcements() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await fetch(`/api/employees?announcements=true&t=${Date.now()}`).then(
        (r) => r.json()
      );

      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const displayedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Admin must see expired announcements too, so they can edit/delete them.
    if (isAdmin) return sorted;

    return sorted.filter((item) => !isExpired(item));
  }, [items, isAdmin]);

  const saveAnnouncement = async (event: FormEvent) => {
    event.preventDefault();

    if (!isAdmin || !profile) return;

    if (!form.title.trim() || !form.body.trim()) {
      setMessage('Title and announcement body are required.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'announcement_save',
          ...form,
          expires_at: form.expires_at || null,
          changed_by: profile.id,
          changed_by_name: profile.name,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save announcement.');
      }

      setForm(EMPTY_FORM);
      setMessage('Announcement saved successfully.');
      await fetchAll();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Failed to save announcement.'
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (item: Announcement) => {
    if (!isAdmin || !profile) return;

    if (!window.confirm(`Delete announcement "${item.title}"?`)) return;

    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'announcement_delete',
          id: item.id,
          changed_by: profile.id,
          changed_by_name: profile.name,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to delete announcement.');
      }

      setMessage('Announcement deleted successfully.');
      await fetchAll();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Failed to delete announcement.'
      );
    } finally {
      setSaving(false);
    }
  };

  const editAnnouncement = (item: Announcement) => {
    setForm({
      id: item.id,
      title: item.title,
      body: item.body,
      category: item.category,
      pinned: item.pinned,
      expires_at: item.expires_at ? String(item.expires_at).slice(0, 10) : '',
    });
    setMessage('Editing announcement. Update and click Save.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <LoadingState label="Loading announcements…" />;

  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Company Announcements"
        subtitle="HR notice board for memos, policy reminders, safety notices and payroll updates."
        action={
          <button
            type="button"
            onClick={fetchAll}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-white/[0.05]"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      {isAdmin && (
        <form onSubmit={saveAnnouncement} className="glass rounded-2xl p-5 mb-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
              <Megaphone size={20} />
            </div>
            <div>
              <h3 className="font-display font-semibold">
                {form.id ? 'Edit Announcement' : 'Create Announcement'}
              </h3>
              <p className="text-xs text-muted">
                Employees will see active announcements here and on the dashboard.
              </p>
            </div>
          </div>

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                message.includes('success') || message.includes('Editing')
                  ? 'border-emerald/30 bg-emerald/10 text-emerald'
                  : 'border-rose/30 bg-rose/10 text-rose'
              }`}
            >
              {message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Announcement title"
              className="md:col-span-2 bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
            />

            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
            >
              {['General', 'HR', 'Payroll', 'Holiday', 'Safety', 'Policy'].map(
                (category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                )
              )}
            </select>

            <textarea
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Announcement body"
              className="md:col-span-3 bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 resize-none"
            />

            <label className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              />
              Pinned
            </label>

            <label className="text-sm">
              <span className="block text-xs text-muted mb-1">Expires At</span>
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
              />
            </label>

            <div className="flex gap-2 justify-end items-end">
              {form.id && (
                <button
                  type="button"
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setMessage('');
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : form.id ? (
                  <Save size={16} />
                ) : (
                  <Plus size={16} />
                )}
                {form.id ? 'Save Changes' : 'Publish'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold">
          {isAdmin ? 'All Announcements' : 'Active Announcements'}
        </h3>
        <div className="flex gap-2">
          <Badge tone="info">{items.length} total</Badge>
          <Badge tone="success">
            {items.filter((item) => !isExpired(item)).length} active
          </Badge>
        </div>
      </div>

      {displayedItems.length === 0 ? (
        <EmptyState
          label={
            isAdmin
              ? 'No announcements created yet.'
              : 'No active announcements.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {displayedItems.map((item) => {
            const expired = isExpired(item);

            return (
              <div key={item.id} className="glass rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {item.pinned && <Badge tone="warning">Pinned</Badge>}
                      {expired && <Badge tone="danger">Expired</Badge>}
                      <Badge tone="info">{item.category}</Badge>
                    </div>
                    <h3 className="font-display font-semibold text-lg">{item.title}</h3>
                    <p className="text-xs text-muted mt-1">
                      By {item.created_by_name || 'HR'} · {formatDate(item.created_at)}
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => editAnnouncement(item)}
                        className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10"
                        title="Edit announcement"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAnnouncement(item)}
                        className="rounded-lg border border-rose/20 bg-rose/10 p-2 text-rose hover:bg-rose/20"
                        title="Delete announcement"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted whitespace-pre-wrap mt-4">{item.body}</p>
                {item.expires_at && (
                  <p className="text-xs text-muted mt-4">
                    Expires: {formatDate(item.expires_at)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}