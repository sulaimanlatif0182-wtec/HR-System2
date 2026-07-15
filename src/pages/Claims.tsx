import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  Loader2,
  Download,
  Paperclip,
  Check,
  XCircle,
  ReceiptText,
  Ban,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/ui';

const CLAIM_TYPES = [
  'Fuel',
  'Parking',
  'Toll',
  'Medical',
  'Accommodation',
  'Travel',
  'Office Supplies',
  'Other',
] as const;

const STATUS_TONE: Record<string, string> = {
  pending_manager: 'warning',
  pending_finance: 'info',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'default',
};

interface Claim {
  id: number;
  employee_id: number;
  claim_type: string;
  claim_date: string;
  amount: number;
  description: string;

  vehicle_no: string | null;
  from_location: string | null;
  to_location: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_km: number | null;
  fuel_liters: number | null;
  petrol_station: string | null;
  receipt_no: string | null;

  attachment_url: string | null;
  attachment_name: string | null;

  status: string;

  manager_approved_by: string | null;
  manager_approved_at: string | null;

  finance_approved_by: string | null;
  finance_approved_at: string | null;

  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;

  payroll_period: string | null;
  included_in_payroll: boolean | null;

  created_at: string | null;
}

interface Emp {
  id: number;
  name: string;
  email?: string | null;
  department: string | null;
  role?: string | null;
}

function money(value: unknown) {
  return `RM ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return '""';

  const stringValue = String(value).replace(/"/g, '""');

  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function calculateDistance(start: string, end: string) {
  const s = Number(start);
  const e = Number(end);

  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return '';

  return String(Math.round((e - s) * 100) / 100);
}

export default function Claims() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isManagerOnly = profile?.role === 'manager';
  const isFinanceManager =
    profile?.role === 'manager' &&
    String(profile?.department ?? '').trim().toLowerCase() === 'finance';

  const isAdminOrManager =
    profile?.role === 'admin' || profile?.role === 'manager';

  const profileDepartment = String(profile?.department ?? '')
    .trim()
    .toLowerCase();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    claim_type: 'Fuel',
    claim_date: '',
    amount: '',
    description: '',
    vehicle_no: '',
    from_location: '',
    to_location: '',
    odometer_start: '',
    odometer_end: '',
    distance_km: '',
    fuel_liters: '',
    petrol_station: '',
    receipt_no: '',
  });

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError('');

    try {
      const [claimData, empData] = await Promise.all([
        fetch('/api/claims').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);

      setClaims(Array.isArray(claimData) ? claimData : []);
      setEmployees(Array.isArray(empData) ? empData : []);
    } catch {
      setError('Failed to load claims.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const empMap = useMemo(() => {
    const m: Record<number, Emp> = {};

    employees.forEach((employee) => {
      m[employee.id] = employee;
    });

    return m;
  }, [employees]);

  const visible = useMemo(() => {
    let list = claims;

    if (isAdmin) {
      list = claims;
    } else if (isFinanceManager) {
      list = claims.filter(
        (claim) =>
          claim.status === 'pending_finance' ||
          claim.status === 'approved' ||
          claim.status === 'rejected'
      );
    } else if (isManagerOnly) {
      list = claims.filter((claim) => {
        const employeeDepartment = String(
          empMap[claim.employee_id]?.department ?? ''
        )
          .trim()
          .toLowerCase();

        return employeeDepartment === profileDepartment;
      });
    } else {
      list = claims.filter((claim) => claim.employee_id === profile?.id);
    }

    if (filter !== 'all') {
      list = list.filter((claim) => claim.status === filter);
    }

    return list;
  }, [
    claims,
    filter,
    isAdmin,
    isFinanceManager,
    isManagerOnly,
    profile?.id,
    profileDepartment,
    empMap,
  ]);

  const activeVisible = useMemo(
    () =>
      visible.filter(
        (claim) => claim.status !== 'rejected' && claim.status !== 'cancelled'
      ),
    [visible]
  );

  const totalVisible = activeVisible.reduce(
    (sum, claim) => sum + Number(claim.amount || 0),
    0
  );

  const pendingManagerCount = activeVisible.filter(
    (claim) => claim.status === 'pending_manager'
  ).length;

  const pendingFinanceCount = activeVisible.filter(
    (claim) => claim.status === 'pending_finance'
  ).length;

  const resetForm = () => {
    setForm({
      claim_type: 'Fuel',
      claim_date: '',
      amount: '',
      description: '',
      vehicle_no: '',
      from_location: '',
      to_location: '',
      odometer_start: '',
      odometer_end: '',
      distance_km: '',
      fuel_liters: '',
      petrol_station: '',
      receipt_no: '',
    });

    setAttachmentFile(null);
    setFormError('');
  };

  const openClaimModal = () => {
    resetForm();
    setShowModal(true);
  };

  const uploadAttachment = async () => {
    if (!attachmentFile || !profile) {
      throw new Error('Receipt attachment is required.');
    }

    const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    const filePath = `${profile.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('claim-attachments')
      .upload(filePath, attachmentFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message || 'Failed to upload receipt.');
    }

    const { data } = supabase.storage
      .from('claim-attachments')
      .getPublicUrl(filePath);

    return {
      attachment_url: data.publicUrl,
      attachment_name: safeName,
    };
  };

  const submitClaim = async (e: FormEvent) => {
    e.preventDefault();

    if (!profile) return;

    if (!form.claim_type) {
      setFormError('Claim type is required.');
      return;
    }

    if (!form.claim_date) {
      setFormError('Claim date is required.');
      return;
    }

    if (!form.amount || Number(form.amount) <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }

    if (!form.description.trim()) {
      setFormError('Purpose / description is required.');
      return;
    }

    if (!attachmentFile) {
      setFormError('Receipt attachment is required.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const attachment = await uploadAttachment();

      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: profile.id,
          claim_type: form.claim_type,
          claim_date: form.claim_date,
          amount: Number(form.amount),
          description: form.description,
          vehicle_no: form.vehicle_no || null,
          from_location: form.from_location || null,
          to_location: form.to_location || null,
          odometer_start: form.odometer_start || null,
          odometer_end: form.odometer_end || null,
          distance_km: form.distance_km || null,
          fuel_liters: form.fuel_liters || null,
          petrol_station: form.petrol_station || null,
          receipt_no: form.receipt_no || null,
          attachment_url: attachment.attachment_url,
          attachment_name: attachment.attachment_name,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to submit claim.');
      }

      setShowModal(false);
      resetForm();
      await fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit claim.');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (
    claim: Claim,
    action: 'manager_approve' | 'finance_approve' | 'reject' | 'cancel'
  ) => {
    if (!profile) return;

    let rejectionReason = '';

    if (action === 'reject') {
      rejectionReason = window.prompt('Reason for rejection?') || '';

      if (!rejectionReason.trim()) {
        alert('Rejection reason is required.');
        return;
      }
    }

    const confirmed = window.confirm(
      `Confirm action: ${action.replace('_', ' ')}?`
    );

    if (!confirmed) return;

    setActingId(claim.id);

    try {
      const res = await fetch('/api/claims', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: claim.id,
          action,
          actor_id: profile.id,
          actor_name: profile.name,
          actor_role: profile.role,
          actor_department: profile.department,
          rejection_reason: rejectionReason,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update claim.');
      }

      await fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update claim.');
    } finally {
      setActingId(null);
    }
  };

  const canManagerApprove = (claim: Claim) => {
    if (!profile || claim.status !== 'pending_manager') return false;

    if (isAdmin) return true;

    if (!isManagerOnly) return false;

    if (Number(profile.id) === Number(claim.employee_id)) return false;

    const employeeDepartment = String(empMap[claim.employee_id]?.department ?? '')
      .trim()
      .toLowerCase();

    return employeeDepartment === profileDepartment;
  };

  const canFinanceApprove = (claim: Claim) => {
    if (claim.status !== 'pending_finance') return false;

    return Boolean(isAdmin || isFinanceManager);
  };

  const canCancel = (claim: Claim) => {
    if (claim.status !== 'pending_manager') return false;

    return Boolean(isAdmin || Number(profile?.id) === Number(claim.employee_id));
  };

  const handleExportCsv = () => {
    const rows = visible.map((claim) => ({
      ID: claim.id,
      Employee_ID: claim.employee_id,
      Employee_Name: empMap[claim.employee_id]?.name ?? `#${claim.employee_id}`,
      Department: empMap[claim.employee_id]?.department ?? '',
      Claim_Type: claim.claim_type,
      Claim_Date: claim.claim_date,
      Amount: claim.amount,
      Description: claim.description,
      Vehicle_No: claim.vehicle_no ?? '',
      From: claim.from_location ?? '',
      To: claim.to_location ?? '',
      Odometer_Start: claim.odometer_start ?? '',
      Odometer_End: claim.odometer_end ?? '',
      Distance_KM: claim.distance_km ?? '',
      Fuel_Liters: claim.fuel_liters ?? '',
      Petrol_Station: claim.petrol_station ?? '',
      Receipt_No: claim.receipt_no ?? '',
      Attachment: claim.attachment_url ?? '',
      Status: claim.status,
      Manager_Approved_By: claim.manager_approved_by ?? '',
      Finance_Approved_By: claim.finance_approved_by ?? '',
      Rejected_By: claim.rejected_by ?? '',
      Rejection_Reason: claim.rejection_reason ?? '',
      Payroll_Period: claim.payroll_period ?? '',
      Included_In_Payroll: claim.included_in_payroll ? 'Yes' : 'No',
    }));

    downloadCsv('claims.csv', rows);
  };

  if (loading) return <LoadingState label="Loading claims…" />;

  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Claims"
        subtitle={
          isAdmin
            ? 'Review and manage all employee claims.'
            : isFinanceManager
              ? 'Review claims pending Finance approval.'
              : isManagerOnly
                ? `Review claims for ${profile?.department ?? 'your department'}.`
                : 'Submit and track your claims.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isAdminOrManager && (
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={visible.length === 0}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              >
                <Download size={16} />
                Export CSV
              </button>
            )}

            <button
              type="button"
              onClick={openClaimModal}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:scale-[1.02] transition-all"
            >
              <Plus size={16} />
              Submit Claim
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-muted">Active Claims</p>
          <p className="font-display text-2xl font-bold mt-1">
            {activeVisible.length}
          </p>
        </div>

        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-muted">Pending Manager</p>
          <p className="font-display text-2xl font-bold mt-1">
            {pendingManagerCount}
          </p>
        </div>

        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-muted">Active Total Amount</p>
          <p className="font-display text-2xl font-bold mt-1">
            {money(totalVisible)}
          </p>

          {pendingFinanceCount > 0 && (
            <p className="text-xs text-accent mt-1">
              {pendingFinanceCount} pending finance approval
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1 mb-6 w-fit overflow-x-auto">
        {[
          ['all', 'All'],
          ['pending_manager', 'Pending Manager'],
          ['pending_finance', 'Pending Finance'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
          ['cancelled', 'Cancelled'],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              filter === value
                ? 'bg-primary/20 text-primary'
                : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState label="No claims found." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((claim, index) => (
            <motion.div
              key={claim.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.05, 0.3) }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-sm">
                    {isAdminOrManager
                      ? empMap[claim.employee_id]?.name ?? `#${claim.employee_id}`
                      : `${claim.claim_type} Claim`}
                  </p>

                  <p className="text-xs text-muted mt-0.5">
                    {claim.claim_date} · {claim.claim_type} · {money(claim.amount)}
                    {empMap[claim.employee_id]?.department
                      ? ` · ${empMap[claim.employee_id]?.department}`
                      : ''}
                  </p>
                </div>

                <Badge tone={STATUS_TONE[claim.status] ?? 'default'}>
                  {claim.status.replace('_', ' ')}
                </Badge>
              </div>

              <p className="text-sm text-muted/90 bg-white/[0.03] rounded-lg px-3 py-2 mb-3">
                "{claim.description}"
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted mb-3">
                <p>Vehicle: {claim.vehicle_no ?? '—'}</p>
                <p>Receipt: {claim.receipt_no ?? '—'}</p>
                <p>From: {claim.from_location ?? '—'}</p>
                <p>To: {claim.to_location ?? '—'}</p>

                {claim.claim_type === 'Fuel' && (
                  <>
                    <p>Odo Start: {claim.odometer_start ?? '—'}</p>
                    <p>Odo End: {claim.odometer_end ?? '—'}</p>
                    <p>Distance: {claim.distance_km ?? '—'} km</p>
                    <p>Fuel Liters: {claim.fuel_liters ?? '—'}</p>
                    <p className="col-span-2">
                      Petrol Station: {claim.petrol_station ?? '—'}
                    </p>
                  </>
                )}
              </div>

              {claim.attachment_url && (
                <a
                  href={claim.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mb-3"
                >
                  <Paperclip size={13} />
                  {claim.attachment_name ?? 'View receipt'}
                </a>
              )}

              <div className="text-xs text-muted space-y-1 mb-3">
                {claim.manager_approved_by && (
                  <p>Manager approved by: {claim.manager_approved_by}</p>
                )}

                {claim.finance_approved_by && (
                  <p>Finance approved by: {claim.finance_approved_by}</p>
                )}

                {claim.rejected_by && (
                  <p className="text-rose">
                    Rejected by: {claim.rejected_by} ·{' '}
                    {claim.rejection_reason ?? 'No reason'}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {canManagerApprove(claim) && (
                  <button
                    type="button"
                    onClick={() => handleAction(claim, 'manager_approve')}
                    disabled={actingId === claim.id}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald/15 text-emerald border border-emerald/25 py-2 text-xs font-medium hover:bg-emerald/25 transition-all disabled:opacity-50"
                  >
                    {actingId === claim.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Manager Approve
                  </button>
                )}

                {canFinanceApprove(claim) && (
                  <button
                    type="button"
                    onClick={() => handleAction(claim, 'finance_approve')}
                    disabled={actingId === claim.id}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-accent/15 text-accent border border-accent/25 py-2 text-xs font-medium hover:bg-accent/25 transition-all disabled:opacity-50"
                  >
                    {actingId === claim.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Finance Approve
                  </button>
                )}

                {(canManagerApprove(claim) ||
                  canFinanceApprove(claim) ||
                  isAdmin) &&
                  claim.status !== 'approved' &&
                  claim.status !== 'rejected' &&
                  claim.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => handleAction(claim, 'reject')}
                      disabled={actingId === claim.id}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-rose/15 text-rose border border-rose/25 py-2 text-xs font-medium hover:bg-rose/25 transition-all disabled:opacity-50"
                    >
                      <XCircle size={13} />
                      Reject
                    </button>
                  )}

                {canCancel(claim) && (
                  <button
                    type="button"
                    onClick={() => handleAction(claim, 'cancel')}
                    disabled={actingId === claim.id}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 text-muted border border-white/10 px-3 py-2 text-xs font-medium hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    <Ban size={13} />
                    Cancel
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="glass-solid rounded-2xl p-6 w-full max-w-xl pointer-events-auto max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold flex items-center gap-2">
                    <ReceiptText size={18} />
                    Submit Claim
                  </h3>

                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="text-muted hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={submitClaim} className="space-y-3">
                  <select
                    required
                    value={form.claim_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        claim_type: e.target.value,
                        vehicle_no:
                          e.target.value === 'Fuel' ? form.vehicle_no : '',
                        odometer_start:
                          e.target.value === 'Fuel'
                            ? form.odometer_start
                            : '',
                        odometer_end:
                          e.target.value === 'Fuel' ? form.odometer_end : '',
                        distance_km:
                          e.target.value === 'Fuel' ? form.distance_km : '',
                        fuel_liters:
                          e.target.value === 'Fuel' ? form.fuel_liters : '',
                        petrol_station:
                          e.target.value === 'Fuel'
                            ? form.petrol_station
                            : '',
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    {CLAIM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Claim Date
                      </label>

                      <input
                        required
                        type="date"
                        value={form.claim_date}
                        onChange={(e) =>
                          setForm({ ...form, claim_date: e.target.value })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Amount RM
                      </label>

                      <input
                        required
                        type="number"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) =>
                          setForm({ ...form, amount: e.target.value })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>

                  <textarea
                    required
                    placeholder="Purpose / Description"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    rows={3}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 resize-none"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="From Location optional"
                      value={form.from_location}
                      onChange={(e) =>
                        setForm({ ...form, from_location: e.target.value })
                      }
                      className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    />

                    <input
                      placeholder="To Location optional"
                      value={form.to_location}
                      onChange={(e) =>
                        setForm({ ...form, to_location: e.target.value })
                      }
                      className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    />
                  </div>

                  <input
                    placeholder="Receipt No optional"
                    value={form.receipt_no}
                    onChange={(e) =>
                      setForm({ ...form, receipt_no: e.target.value })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                  />

                  {form.claim_type === 'Fuel' && (
                    <>
                      <input
                        placeholder="Vehicle No optional"
                        value={form.vehicle_no}
                        onChange={(e) =>
                          setForm({ ...form, vehicle_no: e.target.value })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Odometer Start optional"
                          value={form.odometer_start}
                          onChange={(e) => {
                            const nextStart = e.target.value;

                            setForm({
                              ...form,
                              odometer_start: nextStart,
                              distance_km: calculateDistance(
                                nextStart,
                                form.odometer_end
                              ),
                            });
                          }}
                          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                        />

                        <input
                          type="number"
                          step="0.1"
                          placeholder="Odometer End optional"
                          value={form.odometer_end}
                          onChange={(e) => {
                            const nextEnd = e.target.value;

                            setForm({
                              ...form,
                              odometer_end: nextEnd,
                              distance_km: calculateDistance(
                                form.odometer_start,
                                nextEnd
                              ),
                            });
                          }}
                          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <input
                          readOnly
                          placeholder="Distance KM auto"
                          value={form.distance_km}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none text-muted"
                        />

                        <input
                          type="number"
                          step="0.01"
                          placeholder="Fuel Liters optional"
                          value={form.fuel_liters}
                          onChange={(e) =>
                            setForm({ ...form, fuel_liters: e.target.value })
                          }
                          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                        />
                      </div>

                      <input
                        placeholder="Petrol Station optional"
                        value={form.petrol_station}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            petrol_station: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </>
                  )}

                  <div>
                    <label className="text-xs text-muted mb-1 block">
                      Receipt Attachment required
                    </label>

                    <input
                      required
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) =>
                        setAttachmentFile(e.target.files?.[0] ?? null)
                      }
                      className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    />
                  </div>

                  {formError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold mt-2 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      'Submit Claim'
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}