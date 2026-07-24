import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  UserCog,
  Send,
  Check,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

interface Employee {
  id: number;
  name: string;
  email?: string | null;
  department?: string | null;
  phone?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  epf_no?: string | null;
  socso_no?: string | null;
  income_tax_no?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  marital_status?: string | null;
  number_of_children?: number | null;
}

interface ProfileUpdateRequest {
  id: number;
  employee_id: number;
  requested_by?: number | null;
  requested_by_name?: string | null;
  requested_data: Record<string, unknown>;
  status: string;
  reason?: string | null;
  admin_remarks?: string | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  created_at: string;
}

const UPDATE_FIELDS = [
  ['phone', 'Phone'],
  ['address', 'Address'],
  ['bank_name', 'Bank Name'],
  ['bank_account_no', 'Bank Account No'],
  ['epf_no', 'EPF No'],
  ['socso_no', 'SOCSO No'],
  ['income_tax_no', 'Income Tax No'],
  ['emergency_contact_name', 'Emergency Contact Name'],
  ['emergency_contact_relationship', 'Emergency Relationship'],
  ['emergency_contact_phone', 'Emergency Phone'],
  ['marital_status', 'Marital Status'],
  ['number_of_children', 'Number of Children'],
] as const;

function emptyForm() {
  return {
    phone: '',
    address: '',
    bank_name: '',
    bank_account_no: '',
    epf_no: '',
    socso_no: '',
    income_tax_no: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    marital_status: '',
    number_of_children: '0',
    reason: '',
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function statusTone(status: string) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

export default function ProfileUpdates() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<ProfileUpdateRequest[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchAll = async () => {
    if (!profile?.id) return;

    setLoading(true);
    setError('');

    try {
      const [me, req, emp] = await Promise.all([
        fetch(`/api/employees?id=${profile.id}`).then((r) => r.json()),
        fetch(
          isAdmin
            ? '/api/employees?profile_update_requests=true'
            : `/api/employees?profile_update_requests=true&employee_id=${profile.id}`
        ).then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);

      setMyEmployee(me || null);
      setEmployees(Array.isArray(emp) ? emp : []);
      setRequests(Array.isArray(req) ? req : []);

      if (me) {
        setForm({
          ...emptyForm(),
          phone: me.phone ?? '',
          address: me.address ?? '',
          bank_name: me.bank_name ?? '',
          bank_account_no: me.bank_account_no ?? '',
          epf_no: me.epf_no ?? '',
          socso_no: me.socso_no ?? '',
          income_tax_no: me.income_tax_no ?? '',
          emergency_contact_name: me.emergency_contact_name ?? '',
          emergency_contact_relationship: me.emergency_contact_relationship ?? '',
          emergency_contact_phone: me.emergency_contact_phone ?? '',
          marital_status: me.marital_status ?? '',
          number_of_children: String(me.number_of_children ?? 0),
          reason: '',
        });
      }
    } catch {
      setError('Failed to load profile update requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [profile?.id]);

  const employeeMap = useMemo(() => {
    const map: Record<number, Employee> = {};
    employees.forEach((employee) => {
      map[employee.id] = employee;
    });
    return map;
  }, [employees]);

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile?.id) return;

    setSaving(true);
    setMessage('');

    try {
      const requestedData: Record<string, unknown> = {};

      UPDATE_FIELDS.forEach(([key]) => {
        requestedData[key] = form[key as keyof typeof form];
      });

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'profile_update_request_create',
          employee_id: profile.id,
          requested_by: profile.id,
          requested_by_name: profile.name,
          requested_data: requestedData,
          reason: form.reason,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to submit request.');

      setMessage('Profile update request submitted successfully.');
      await fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to submit request.');
    } finally {
      setSaving(false);
    }
  };

  const decideRequest = async (
    request: ProfileUpdateRequest,
    status: 'approved' | 'rejected'
  ) => {
    if (!profile?.id) return;

    const adminRemarks = window.prompt(
      status === 'approved' ? 'Approval remarks (optional):' : 'Reject reason:'
    );

    if (status === 'rejected' && !adminRemarks?.trim()) return;

    setDeciding(request.id);

    try {
      const res = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'profile_update_decision',
          id: request.id,
          status,
          admin_remarks: adminRemarks || null,
          decided_by: profile.id,
          decided_by_name: profile.name,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to update request.');

      await fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update request.');
    } finally {
      setDeciding(null);
    }
  };

  if (loading) return <LoadingState label="Loading profile update requests…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Profile Update Requests"
        subtitle={
          isAdmin
            ? 'Review and approve employee profile update requests.'
            : 'Submit changes to your HR profile for admin approval.'
        }
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form onSubmit={submitRequest} className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
              <UserCog size={20} />
            </div>
            <div>
              <h3 className="font-display font-semibold">Request Profile Update</h3>
              <p className="text-xs text-muted mt-1">
                Changes will only update your official record after Admin approval.
              </p>
            </div>
          </div>

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                message.includes('success')
                  ? 'border-emerald/30 bg-emerald/10 text-emerald'
                  : 'border-rose/30 bg-rose/10 text-rose'
              }`}
            >
              {message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {UPDATE_FIELDS.map(([key, label]) => (
              <label key={key} className="text-sm">
                <span className="block text-xs text-muted mb-1">{label}</span>
                {key === 'marital_status' ? (
                  <select
                    value={form.marital_status}
                    onChange={(e) => setForm({ ...form, marital_status: e.target.value })}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  >
                    <option value="">Select</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                ) : (
                  <input
                    type={key === 'number_of_children' ? 'number' : 'text'}
                    min={key === 'number_of_children' ? 0 : undefined}
                    value={String(form[key as keyof typeof form] ?? '')}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                )}
              </label>
            ))}
          </div>

          <label className="text-sm block">
            <span className="block text-xs text-muted mb-1">Reason / Notes</span>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 resize-none"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !myEmployee}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit Request
          </button>
        </form>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">
            {isAdmin ? 'All Requests' : 'My Requests'}
          </h3>

          {requests.length === 0 ? (
            <EmptyState label="No profile update requests yet." />
          ) : (
            <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
              {requests.map((request) => (
                <div key={request.id} className="rounded-xl border border-white/10 bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">
                        {employeeMap[request.employee_id]?.name ?? `Employee #${request.employee_id}`}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {formatDateTime(request.created_at)} · Requested by {request.requested_by_name || '—'}
                      </p>
                    </div>
                    <Badge tone={statusTone(request.status)}>{request.status}</Badge>
                  </div>

                  <pre className="mt-3 max-h-44 overflow-auto rounded-xl bg-black/20 p-3 text-[11px] text-muted whitespace-pre-wrap">
                    {JSON.stringify(request.requested_data, null, 2)}
                  </pre>

                  {request.reason && (
                    <p className="text-xs text-muted mt-2">Reason: {request.reason}</p>
                  )}
                  {request.admin_remarks && (
                    <p className="text-xs text-muted mt-1">Admin: {request.admin_remarks}</p>
                  )}

                  {isAdmin && request.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => decideRequest(request, 'approved')}
                        disabled={deciding === request.id}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald/15 text-emerald border border-emerald/25 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        {deciding === request.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => decideRequest(request, 'rejected')}
                        disabled={deciding === request.id}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose/15 text-rose border border-rose/25 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
