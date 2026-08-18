import apiClient from '../lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Save,
  Trash2,
  Loader2,
  RefreshCw,
  Printer,
  Pencil,
  Check,
  ClipboardList,
  Star,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { printDocument } from '../lib/print';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/ui';
import Evaluation from './performance/Evaluation';

interface Employee {
  id: number;
  name: string;
  department?: string | null;
  title?: string | null;
}

interface Review {
  id: number;
  employee_id: number;
  review_period: string;
  review_type: string;
  reviewer_name?: string | null;
  kpi_score: number;
  behavior_score: number;
  attendance_score: number;
  overall_score: number;
  strengths?: string | null;
  improvements?: string | null;
  goals?: string | null;
  recommendation?: string | null;
  manager_remarks?: string | null;
  admin_remarks?: string | null;
  employee_acknowledged?: boolean | null;
  employee_acknowledged_at?: string | null;
  acknowledged_by_name?: string | null;
  status: string;
  created_at: string;
}

interface ReviewForm {
  id: number | null;
  employee_id: string;
  review_period: string;
  review_type: string;
  kpi_score: string;
  behavior_score: string;
  attendance_score: string;
  strengths: string;
  improvements: string;
  goals: string;
  recommendation: string;
  manager_remarks: string;
  admin_remarks: string;
  status: string;
}

const EMPTY: ReviewForm = {
  id: null,
  employee_id: '',
  review_period: new Date().getFullYear().toString(),
  review_type: 'Annual Review',
  kpi_score: '0',
  behavior_score: '0',
  attendance_score: '0',
  strengths: '',
  improvements: '',
  goals: '',
  recommendation: '',
  manager_remarks: '',
  admin_remarks: '',
  status: 'draft',
};

const REVIEW_TYPES = [
  'Annual Review',
  'Probation Review',
  'Promotion Review',
  'Performance Improvement',
];

function scoreTone(score: number) {
  if (score >= 85) return 'success';
  if (score >= 70) return 'info';
  if (score >= 50) return 'warning';
  return 'danger';
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function Performance() {
  const { profile } = useAuth();
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [searchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'appraisal' ? 'appraisal' : 'evaluation';
  const [tab, setTab] = useState<'appraisal' | 'evaluation'>(initialTab);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [form, setForm] = useState<ReviewForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [emp, reviewData] = await Promise.all([
        apiClient.get('/api/employees'),
        apiClient.get(
          profile?.role === 'employee'
            ? `/api/employees?performance_reviews=true&employee_id=${profile?.id}`
            : '/api/employees?performance_reviews=true'
        ),
      ]);

      setEmployees(Array.isArray(emp) ? emp : []);
      setReviews(Array.isArray(reviewData) ? reviewData : []);
    } catch {
      setError('Failed to load performance reviews.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void (async () => {
      await fetchAll();
    })();
  }, [fetchAll]);

  const employeeMap = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

  const overall = Math.round(
    ((Number(form.kpi_score) || 0) +
      (Number(form.behavior_score) || 0) +
      (Number(form.attendance_score) || 0)) /
      3
  );

  const saveReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !form.employee_id) return;

    setSaving(true);
    setMessage('');

    try {
      await apiClient.post('/api/employees', {
        action: 'performance_save',
        ...form,
        employee_id: Number(form.employee_id),
        overall_score: overall,
        reviewer_id: profile.id,
        reviewer_name: profile.name,
        changed_by: profile.id,
        changed_by_name: profile.name,
      });

      setForm(EMPTY);
      setMessage('Performance review saved successfully.');
      await fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save review.');
    } finally {
      setSaving(false);
    }
  };

  const editReview = (review: Review) => {
    setForm({
      id: review.id,
      employee_id: String(review.employee_id),
      review_period: review.review_period,
      review_type: review.review_type,
      kpi_score: String(review.kpi_score),
      behavior_score: String(review.behavior_score),
      attendance_score: String(review.attendance_score),
      strengths: review.strengths ?? '',
      improvements: review.improvements ?? '',
      goals: review.goals ?? '',
      recommendation: review.recommendation ?? '',
      manager_remarks: review.manager_remarks ?? '',
      admin_remarks: review.admin_remarks ?? '',
      status: review.status,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteReview = async (review: Review) => {
    if (!profile || !window.confirm('Delete performance review?')) return;

    try {
      await apiClient.post('/api/employees', {
        action: 'performance_delete',
        id: review.id,
        changed_by: profile.id,
        changed_by_name: profile.name,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete.');
    }
    await fetchAll();
  };

  const acknowledgeReview = async (review: Review) => {
    if (!profile) return;

    if (!window.confirm('Acknowledge this performance review as accurate?')) return;

    try {
      await apiClient.post('/api/employees', {
        action: 'performance_acknowledge',
        id: review.id,
        employee_id: profile.id,
        employee_name: profile.name,
        changed_by: profile.id,
        changed_by_name: profile.name,
      });

      setMessage('Performance review acknowledged successfully.');
      await fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to acknowledge review.');
    }
  };

  const printReview = (review: Review) => {
    const employee = employeeMap[review.employee_id];

    const bodyHtml = `
      <div class="grid">
        <div class="box"><div class="label">Employee</div><div class="value">${escapeHtml(employee?.name || `#${review.employee_id}`)}</div></div>
        <div class="box"><div class="label">Department / Title</div><div class="value">${escapeHtml([employee?.department, employee?.title].filter(Boolean).join(' · ') || '—')}</div></div>
        <div class="box"><div class="label">Review Period</div><div class="value">${escapeHtml(review.review_period)}</div></div>
        <div class="box"><div class="label">Review Type</div><div class="value">${escapeHtml(review.review_type)}</div></div>
        <div class="box"><div class="label">Reviewer</div><div class="value">${escapeHtml(review.reviewer_name || '—')}</div></div>
        <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(review.status)}</div></div>
      </div>

      <h2>Scores</h2>
      <div class="grid">
        <div class="box"><div class="label">KPI</div><div class="value">${escapeHtml(review.kpi_score)}</div></div>
        <div class="box"><div class="label">Behavior</div><div class="value">${escapeHtml(review.behavior_score)}</div></div>
        <div class="box"><div class="label">Attendance</div><div class="value">${escapeHtml(review.attendance_score)}</div></div>
        <div class="box"><div class="label">Overall</div><div class="score">${escapeHtml(review.overall_score)}</div></div>
      </div>

      <h2>Strengths</h2><div class="section">${escapeHtml(review.strengths || '—')}</div>
      <h2>Improvements</h2><div class="section">${escapeHtml(review.improvements || '—')}</div>
      <h2>Goals</h2><div class="section">${escapeHtml(review.goals || '—')}</div>
      <h2>Recommendation</h2><div class="section">${escapeHtml(review.recommendation || '—')}</div>

      <div class="signature-2">
        <div class="line">Employee Signature / Date</div>
        <div class="line">Reviewer / HR Signature / Date</div>
      </div>`;

    printDocument({
      title: `Performance Review - ${employee?.name || review.employee_id}`,
      docTitle: 'Performance / Appraisal Review',
      subtitle: 'Human Resource Department',
      bodyHtml,
    });
  };

  if (loading) return <LoadingState label="Loading performance reviews…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <>
      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-surface p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('evaluation')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            tab === 'evaluation'
              ? 'bg-gradient-to-r from-primary to-primary-2 text-white shadow-lg shadow-primary/30'
              : 'text-muted hover:text-ink'
          }`}
        >
          <Star size={15} /> Evaluation
        </button>
        <button
          type="button"
          onClick={() => setTab('appraisal')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            tab === 'appraisal'
              ? 'bg-gradient-to-r from-primary to-primary-2 text-white shadow-lg shadow-primary/30'
              : 'text-muted hover:text-ink'
          }`}
        >
          <ClipboardList size={15} /> Appraisal
        </button>
      </div>

      {tab === 'evaluation' ? (
        <Evaluation />
      ) : (
    <div>
      <PageHeader
        title="Performance / Appraisal"
        subtitle="Track KPI scores, manager review, goals and appraisal recommendations."
        action={
          <button
            type="button"
            onClick={fetchAll}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {isAdminOrManager && (
          <form onSubmit={saveReview} className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="font-display font-semibold">Review Form</h3>
                <p className="text-xs text-muted">
                  Overall score is average of KPI, behavior and attendance.
                </p>
              </div>
            </div>

            {message && (
              <p className={`text-sm ${message.includes('success') ? 'text-emerald' : 'text-rose'}`}>
                {message}
              </p>
            )}

            <select
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={form.review_period}
                onChange={(e) => setForm({ ...form, review_period: e.target.value })}
                placeholder="Review period"
                className="bg-surface border border-white/10 rounded-xl px-3 py-2.5"
              />
              <select
                value={form.review_type}
                onChange={(e) => setForm({ ...form, review_type: e.target.value })}
                className="bg-surface border border-white/10 rounded-xl px-3 py-2.5"
              >
                {REVIEW_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {([
                ['kpi_score', 'KPI'],
                ['behavior_score', 'Behavior'],
                ['attendance_score', 'Attendance'],
              ] as const).map(([key, label]) => (
                <label key={key} className="text-xs text-muted">
                  {label}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="mt-1 w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"
                  />
                </label>
              ))}
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-3">
                <p className="text-xs text-muted">Overall</p>
                <p className="font-bold text-xl">{overall}</p>
              </div>
            </div>

            {(['strengths', 'improvements', 'goals', 'recommendation'] as const).map((key) => (
              <textarea
                key={key}
                rows={2}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={key.replace('_', ' ')}
                className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 resize-none"
              />
            ))}

            {(['manager_remarks', 'admin_remarks'] as const).map((key) => (
              <textarea
                key={key}
                rows={2}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={key.replace('_', ' ')}
                className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 resize-none"
              />
            ))}

            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"
            >
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
              <option value="acknowledged">Acknowledged</option>
            </select>

            <div className="grid grid-cols-1 sm:flex sm:justify-end gap-2">
              {form.id && (
                <button
                  type="button"
                  onClick={() => setForm(EMPTY)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5"
                >
                  Cancel
                </button>
              )}
              <button
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            </div>
          </form>
        )}

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold mb-4">Reviews</h3>
          {reviews.length === 0 ? (
            <EmptyState label="No performance reviews yet." />
          ) : (
            <div className="space-y-3 max-h-[760px] overflow-y-auto">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-xl border border-white/10 bg-surface p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold">{employeeMap[review.employee_id]?.name ?? `#${review.employee_id}`}</p>
                      <p className="text-xs text-muted">
                        {review.review_type} · {review.review_period} · Reviewer: {review.reviewer_name || '—'}
                      </p>
                    </div>
                    <Badge tone={scoreTone(Number(review.overall_score))}>{review.overall_score}</Badge>
                  </div>
                  <p className="text-xs text-muted mt-2">Strengths: {review.strengths || '—'}</p>
                  <p className="text-xs text-muted mt-1">Improvements: {review.improvements || '—'}</p>
                  {review.manager_remarks && (
                    <p className="text-xs text-muted mt-1">Manager remarks: {review.manager_remarks}</p>
                  )}
                  {review.admin_remarks && (
                    <p className="text-xs text-muted mt-1">Admin remarks: {review.admin_remarks}</p>
                  )}
                  {review.employee_acknowledged && (
                    <p className="text-xs text-emerald mt-1">
                      Acknowledged by employee{review.acknowledged_by_name ? ` (${review.acknowledged_by_name})` : ''}
                      {review.employee_acknowledged_at
                        ? ` · ${formatDate(review.employee_acknowledged_at)}`
                        : ''}
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => printReview(review)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                    >
                      <Printer size={14} /> Print
                    </button>
                    {!isAdminOrManager &&
                      Number(review.employee_id) === Number(profile?.id) &&
                      !review.employee_acknowledged && (
                        <button
                          type="button"
                          onClick={() => acknowledgeReview(review)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald/25 bg-emerald/15 px-3 py-2 text-xs font-semibold text-emerald"
                        >
                          <Check size={14} /> Acknowledge
                        </button>
                      )}
                    {isAdminOrManager && (
                      <>
                        <button
                          type="button"
                          onClick={() => editReview(review)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteReview(review)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose/20 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}