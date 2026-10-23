import apiClient from '../../lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../lib/featureFlags';
import { printDocument, escapeHtml } from '../../lib/print';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/ui';
import {
  ClipboardList,
  Save,
  Trash2,
  Loader2,
  RefreshCw,
  Printer,
  Pencil,
  Check,
} from 'lucide-react';

interface Criterion {
  id: string;
  name: string;
  max_score: number;
  description?: string | null;
}

interface TemplateSection {
  id: string;
  name: string;
  criteria: Criterion[];
}

interface TemplateRow {
  id: number;
  name: string;
  type: string;
  category?: string;
  department: string | null;
  description: string | null;
  sections: TemplateSection[];
  status: string;
  created_by: number | null;
  created_by_name: string | null;
  created_by_role: string | null;
  created_at: string;
}

interface EvalRow {
  id: number;
  template_id: number;
  employee_id: number;
  evaluator_id: number | null;
  evaluator_name: string | null;
  evaluator_role: string | null;
  review_period: string;
  scores: Record<string, { score: number; comment: string | null }>;
  overall_score: number;
  status: string;
  employee_acknowledged?: boolean;
  updated_at?: string;
  created_at?: string;
}

interface EmployeeRow {
  id: number;
  name: string;
  role: string;
  department?: string | null;
  category?: string | null;
}

const TEMPLATE_TYPES = [
  { value: 'performance_increment', label: 'Performance Increment' },
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'promotion', label: 'Promotion' },
];

const typeLabel = (value: string) =>
  TEMPLATE_TYPES.find((item) => item.value === value)?.label || 'Performance Increment';

const REPORT_FIXED_MAX = 55;

function newId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyCriterion(): Criterion {
  return { id: newId(), name: '', max_score: 5, description: '' };
}

function emptySection(): TemplateSection {
  return { id: newId(), name: '', criteria: [emptyCriterion()] };
}

interface TemplateDraft {
  id: number | null;
  name: string;
  type: string;
  description: string;
  status: 'active' | 'inactive';
  sections: TemplateSection[];
}

function emptyDraft(): TemplateDraft {
  return {
    id: null,
    name: '',
    type: 'performance_increment',
    description: '',
    status: 'active',
    sections: [emptySection()],
  };
}

interface AnswerDraft {
  evaluationId: number | null;
  template: TemplateRow | null;
  reviewPeriod: string;
  scores: Record<string, { score: number; comment: string }>;
}

function criteriaOf(template: TemplateRow | null): Criterion[] {
  return (template?.sections || []).flatMap((section) => section.criteria || []);
}

function overallPercent(row: EvalRow, template: TemplateRow | undefined): string {
  const max = criteriaOf(template || null).length * 5;
  if (!max) return '0.0';
  return ((Number(row.overall_score) / max) * 100).toFixed(1);
}

const SCORE_WORDS: Record<number, string> = {
  0: 'Not rated',
  1: 'Very Poor',
  2: 'Unsatisfactory',
  3: 'Satisfactory',
  4: 'Good',
  5: 'Excellent',
};

export default function Evaluation() {
  const { profile } = useAuth();
  const { adminCapability } = useFeatureFlags();

  // Tri-state rule: an admin whose Performance feature is on Default (staff view)
  // uses the employee experience end to end.
  const isAdmin = profile?.role === 'admin';
  const effectiveRole =
    isAdmin && !adminCapability('performance') ? 'employee' : (profile?.role || 'employee');
  const isManagerLike = effectiveRole === 'admin' || effectiveRole === 'manager';

  const [tab, setTab] = useState<'templates' | 'answer' | 'report'>(isManagerLike ? 'templates' : 'answer');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [evaluations, setEvaluations] = useState<EvalRow[]>([]);
  const [templatesById, setTemplatesById] = useState<Map<number, TemplateRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [answer, setAnswer] = useState<AnswerDraft>({
    evaluationId: null,
    template: null,
    reviewPeriod: '',
    scores: {},
  });

  const myDepartment = String(profile?.department || '');

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError('');
    try {
      const [emp, templateData, evaluationData] = await Promise.all([
        apiClient.get('/api/employees'),
        apiClient.get('/api/employees?evaluation_templates=true'),
        apiClient.get('/api/employees?evaluations=true'),
      ]);
      setEmployees(Array.isArray(emp) ? emp : []);
      const templateRows = Array.isArray(templateData) ? (templateData as TemplateRow[]) : [];
      setTemplates(templateRows);
      setTemplatesById(new Map(templateRows.map((row) => [row.id, row])));
      setEvaluations(Array.isArray(evaluationData) ? (evaluationData as EvalRow[]) : []);
    } catch {
      setError('Failed to load evaluation data.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Templates the signed-in user is supposed to answer, per the answering chain:
  // staff -> manager-forms; managers/admins -> admin-forms; own department only.
  const answerableTemplates = useMemo(() => {
    const neededRole = effectiveRole === 'employee' ? 'manager' : 'admin';
    return templates.filter(
      (row) =>
        String(row.department || '') === myDepartment &&
        String(row.created_by_role || '') === neededRole &&
        String(row.status) === 'active'
    );
  }, [templates, myDepartment, effectiveRole]);

  const myEvaluations = useMemo(
    () => evaluations.filter((row) => Number(row.employee_id) === Number(profile?.id)),
    [evaluations, profile?.id]
  );

  const visibleSubmissions = useMemo(() => {
    if (effectiveRole === 'employee') return [];
    // Server already scopes rows to the viewer's department and level.
    return evaluations;
  }, [evaluations, effectiveRole]);

  const reportRows = useMemo(() => {
    if (!isManagerLike) return [];
    const subjects = employees.filter((person) => {
      if (String(person.department || '') !== myDepartment) return false;
      const self = Number(person.id) === Number(profile?.id);
      if (effectiveRole === 'manager') return person.role === 'employee' || self;
      return person.role === 'employee' || person.role === 'manager' || self;
    });

    return subjects
      .map((subject) => {
        const rows = evaluations.filter(
          (row) => Number(row.employee_id) === Number(subject.id) && String(row.status) === 'completed'
        );
        const total = rows.reduce((sum, row) => {
          const tpl = templatesById.get(row.template_id) || null;
          // Missing template (deleted later): fall back to the criteria present
          // in the stored scores JSON (max 5 per criterion, enforced at save).
          const items = tpl ? criteriaOf(tpl) : null;
          const add = (id: string) => Number(row.scores?.[id]?.score || 0);
          let rowTotal = 0;
          if (items) {
            for (const criterion of items) rowTotal += add(criterion.id);
          } else if (row.scores && typeof row.scores === 'object') {
            for (const id of Object.keys(row.scores)) rowTotal += add(id);
          }
          return sum + rowTotal;
        }, 0);
        return {
          subject,
          completed: rows.length,
          total,
          percentage: (total / REPORT_FIXED_MAX) * 100,
        };
      })
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name));
  }, [employees, evaluations, templatesById, myDepartment, profile?.id, effectiveRole, isManagerLike]);

  const openTemplateEditor = (template?: TemplateRow) => {
    setMessage('');
    if (!template) {
      setDraft(emptyDraft());
      return;
    }
    setDraft({
      id: template.id,
      name: template.name,
      type: template.type || 'performance_increment',
      description: template.description || '',
      status: String(template.status) === 'inactive' ? 'inactive' : 'active',
      sections: (template.sections || []).map((section) => ({
        id: section.id || newId(),
        name: section.name || '',
        criteria: (section.criteria || []).map((criterion) => ({
          id: criterion.id || newId(),
          name: criterion.name || '',
          max_score: 5,
          description: criterion.description || '',
        })),
      })),
    });
    setTab('templates');
  };

  const saveTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !profile) return;
    if (!draft.name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!draft.sections.some((section) => section.name.trim() && section.criteria.length)) {
      setError('Every section needs a name and at least one criterion.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await apiClient.post('/api/employees', {
        action: 'template_save',
        id: draft.id,
        name: draft.name.trim(),
        type: draft.type,
        description: draft.description.trim(),
        status: draft.status,
        department: profile.department,
        sections: draft.sections,
      });
      setDraft(null);
      setMessage('Template saved.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template: TemplateRow) => {
    if (!profile) return;
    if (!window.confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;
    setBusyId(template.id);
    setError('');
    try {
      await apiClient.post('/api/employees', { action: 'template_delete', id: template.id });
      setMessage('Template deleted.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template.');
    } finally {
      setBusyId(null);
    }
  };

  const openAnswerForm = (template: TemplateRow) => {
    setMessage('');
    const existing = myEvaluations.find(
      (row) => Number(row.template_id) === Number(template.id) && String(row.status) !== 'completed'
    );
    const scores: AnswerDraft['scores'] = {};
    criteriaOf(template).forEach((criterion) => {
      const saved = existing?.scores?.[criterion.id];
      scores[criterion.id] = {
        score: Number(saved?.score || 0),
        comment: String(saved?.comment || ''),
      };
    });
    setAnswer({
      evaluationId: existing?.id || null,
      template,
      reviewPeriod: existing?.review_period || '',
      scores,
    });
  };

  const saveEvaluation = async (status: 'draft' | 'completed') => {
    if (!answer.template || !profile) return;
    if (!answer.reviewPeriod.trim()) {
      setError('Review period is required, e.g. "2026-10".');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/api/employees', {
        action: 'evaluation_save',
        id: answer.evaluationId,
        template_id: answer.template.id,
        review_period: answer.reviewPeriod.trim(),
        scores: answer.scores,
        status,
      });
      setMessage(
        status === 'completed'
          ? `Evaluation submitted. Score credit total: ${criteriaOf(answer.template).reduce((s, c) => s + Number(answer.scores[c.id]?.score || 0), 0)} / 55.`
          : 'Draft saved.'
      );
      if (status === 'completed') {
        setAnswer({ evaluationId: null, template: null, reviewPeriod: '', scores: {} });
      }
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save evaluation.');
    } finally {
      setSaving(false);
    }
  };

  const acknowledgeEvaluation = async (row: EvalRow) => {
    if (!profile) return;
    setBusyId(row.id);
    setError('');
    try {
      await apiClient.post('/api/employees', {
        action: 'evaluation_acknowledge',
        id: row.id,
        employee_id: profile.id,
        employee_name: profile.name,
      });
      setMessage('Acknowledged.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteEvaluation = async (row: EvalRow) => {
    if (!window.confirm('Delete this evaluation?')) return;
    setBusyId(row.id);
    setError('');
    try {
      await apiClient.post('/api/employees', { action: 'evaluation_delete', id: row.id });
      setMessage('Evaluation deleted.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete evaluation.');
    } finally {
      setBusyId(null);
    }
  };

  const templateName = (templateId: number) => templatesById.get(templateId)?.name || 'Template unavailable';

  const printReport = () => {
    if (!reportRows.length) return;

    const rowsHtml = reportRows
      .map(
        (row) =>
          `<tr>` +
          `<td style="padding:6px 10px;border:1px solid #e5e7eb">${escapeHtml(row.subject.name)}</td>` +
          `<td style="padding:6px 10px;border:1px solid #e5e7eb">${escapeHtml(row.subject.role)}</td>` +
          `<td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${row.completed}</td>` +
          `<td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${row.total.toFixed(0)} / 55</td>` +
          `<td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center"><b>${row.percentage.toFixed(1)}%</b></td>` +
          `</tr>`
      )
      .join('');

    printDocument({
      title: 'Evaluation Report',
      subtitle: `${myDepartment} department — completed evaluations, percentage of 55`,
      bodyHtml:
        `<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>` +
        `<th style="padding:8px 10px;border:1px solid #1f4fa3;background:#eef2f9;text-align:left">Name</th>` +
        `<th style="padding:8px 10px;border:1px solid #1f4fa3;background:#eef2f9;text-align:left">Role</th>` +
        `<th style="padding:8px 10px;border:1px solid #1f4fa3;background:#eef2f9;text-align:left">Completed forms</th>` +
        `<th style="padding:8px 10px;border:1px solid #1f4fa3;background:#eef2f9;text-align:left">Score credit total</th>` +
        `<th style="padding:8px 10px;border:1px solid #1f4fa3;background:#eef2f9;text-align:left">Percentage</th>` +
        `</tr></thead><tbody>${rowsHtml}</tbody></table>`,
    });
  };

  if (loading) return <LoadingState />;
  if (error && !saving) {
    return (
      <>
        <PageHeader title="Evaluation" subtitle="Department-scoped evaluation forms." />
        <ErrorState message={error} />
        <div className="mt-3">
          <button
            type="button"
            onClick={fetchAll}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </>
    );
  }

  const tabs: Array<{ key: 'templates' | 'answer' | 'report'; label: string }> = [];
  if (isManagerLike) tabs.push({ key: 'templates', label: 'Templates' });
  tabs.push({ key: 'answer', label: 'Answer' });
  if (isManagerLike) tabs.push({ key: 'report', label: 'Report' });

  return (
    <>
      <PageHeader title="Evaluation" subtitle="Department-scoped evaluation forms, answered on yourself." />

      {tabs.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                setMessage('');
              }}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                tab === item.key
                  ? 'bg-primary text-white'
                  : 'border border-border bg-white text-muted-foreground hover:bg-muted'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={fetchAll}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {saving && (
        <div className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Saving…
        </div>
      )}
      {error && saving && (
        <div className="mb-4 rounded-xl border border-rose/30 bg-rose/10 px-4 py-2 text-sm text-rose">{error}</div>
      )}

      {/* ---------- Templates tab (admin/manager only) ---------- */}
      {isManagerLike && tab === 'templates' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openTemplateEditor()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white"
            >
              <ClipboardList size={14} /> New template
            </button>
            <span className="text-xs text-muted-foreground">
              Templates are visible only inside {myDepartment || 'your'} department.
            </span>
          </div>

          {draft && (
            <form onSubmit={saveTemplate} className="glass rounded-2xl p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Template name
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
                    placeholder="e.g. 2026 Performance Increment"
                    required
                  />
                </label>
                <label className="block text-xs font-semibold text-muted-foreground">
                  Type
                  <select
                    value={draft.type}
                    onChange={(event) => setDraft({ ...draft, type: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
                  >
                    {TEMPLATE_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold text-muted-foreground">
                Description (optional)
                <input
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
                  placeholder="What is this form for?"
                />
              </label>

              {draft.sections.map((section, sectionIndex) => (
                <div key={section.id} className="rounded-xl border border-border bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={section.name}
                      onChange={(event) => {
                        const sections = [...draft.sections];
                        sections[sectionIndex] = { ...section, name: event.target.value };
                        setDraft({ ...draft, sections });
                      }}
                      className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold"
                      placeholder="Section name (required)"
                      required
                    />
                    {draft.sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            sections: draft.sections.filter((item) => item.id !== section.id),
                          })
                        }
                        className="rounded-lg border border-rose/20 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {section.criteria.map((criterion, criterionIndex) => (
                    <div key={criterion.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <input
                        value={criterion.name}
                        onChange={(event) => {
                          const sections = [...draft.sections];
                          const criteria = [...section.criteria];
                          criteria[criterionIndex] = { ...criterion, name: event.target.value };
                          sections[sectionIndex] = { ...section, criteria };
                          setDraft({ ...draft, sections });
                        }}
                        className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                        placeholder="Criterion (optional — shows as “Criterion”)"
                      />
                      <input
                        value={criterion.description || ''}
                        onChange={(event) => {
                          const sections = [...draft.sections];
                          const criteria = [...section.criteria];
                          criteria[criterionIndex] = { ...criterion, description: event.target.value };
                          sections[sectionIndex] = { ...section, criteria };
                          setDraft({ ...draft, sections });
                        }}
                        className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                        placeholder="Description (optional)"
                      />
                      <span className="min-w-[70px] rounded-lg border border-border bg-muted px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
                        Max 5
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const criteria = section.criteria.filter((item) => item.id !== criterion.id);
                          if (criteria.length) {
                            const sections = [...draft.sections];
                            sections[sectionIndex] = { ...section, criteria };
                            setDraft({ ...draft, sections });
                          }
                        }}
                        className="rounded-lg border border-rose/20 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose"
                        disabled={section.criteria.length <= 1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      const sections = [...draft.sections];
                      sections[sectionIndex] = { ...section, criteria: [...section.criteria, emptyCriterion()] };
                      setDraft({ ...draft, sections });
                    }}
                    className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold"
                  >
                    + Add criterion
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, sections: [...draft.sections, emptySection()] })}
                  className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold"
                >
                  + Add section
                </button>
                <select
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as 'active' | 'inactive' })}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-semibold">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    <Save size={14} /> Save template
                  </button>
                </div>
              </div>
            </form>
          )}

          {templates.length === 0 && !draft && (
            <EmptyState label="No templates yet. Create the first evaluation form for your department." />
          )}

          {templates.length > 0 && (
            <div className="glass overflow-x-auto rounded-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Creator</th>
                    <th className="px-4 py-3">Criteria</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => {
                    const criteriaCount = criteriaOf(template).length;
                    return (
                      <tr key={template.id} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{template.name}</td>
                        <td className="px-4 py-3">{typeLabel(template.type)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {template.created_by_name || '—'} ({template.created_by_role || 'unknown'})
                        </td>
                        <td className="px-4 py-3">{criteriaCount}</td>
                        <td className="px-4 py-3">
                          <Badge tone={String(template.status) === 'active' ? 'success' : 'default'}>
                            {String(template.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openTemplateEditor(template)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTemplate(template)}
                              disabled={busyId === template.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose/20 bg-rose/10 px-3 py-1.5 text-xs font-semibold text-rose disabled:opacity-50"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------- Answer tab (all roles) ---------- */}
      {tab === 'answer' && (
        <div className="space-y-5">
          {isManagerLike && visibleSubmissions.length > 0 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Department submissions</h3>
                <p className="text-xs text-muted-foreground">
                  Read-only. Own-dept {effectiveRole === 'admin' ? 'staff and managers' : 'staff'} plus your own form.
                </p>
              </div>
              <div className="glass overflow-x-auto rounded-2xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Form</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">%</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Ack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSubmissions.map((row) => {
                      const subject = employees.find((person) => Number(person.id) === Number(row.employee_id));
                      const template = templatesById.get(row.template_id);
                      return (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            {subject?.name || `#${row.employee_id}`}
                            {Number(row.employee_id) === Number(profile?.id) && ' (you)'}
                          </td>
                          <td className="px-4 py-3">{templateName(row.template_id)}</td>
                          <td className="px-4 py-3">{typeLabel(template?.type || '')}</td>
                          <td className="px-4 py-3 text-xs">{row.review_period}</td>
                          <td className="px-4 py-3">{overallPercent(row, template)}%</td>
                          <td className="px-4 py-3">
                            <Badge tone={String(row.status) === 'completed' ? 'success' : 'default'}>{row.status}</Badge>
                          </td>
                          <td className="px-4 py-3">{row.employee_acknowledged ? <Check size={14} /> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div>
            <h3 className="text-sm font-semibold">Forms for you to answer</h3>
            <p className="text-xs text-muted-foreground">
              {effectiveRole === 'employee'
                ? 'Evaluation forms created by your department manager.'
                : 'Evaluation forms created by admin accounts in your department.'}
            </p>
          </div>

          {answerableTemplates.length === 0 && !answer.template && (
            <EmptyState
              label={
                effectiveRole === 'employee'
                  ? 'No manager-created evaluation form is active for your department yet.'
                  : 'No admin-created evaluation form is active for your department yet.'
              }
            />
          )}

          {answerableTemplates.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {answerableTemplates.map((template) => {
                const draftRow = myEvaluations.find(
                  (row) => Number(row.template_id) === Number(template.id) && String(row.status) !== 'completed'
                );
                const completedRow = myEvaluations.find(
                  (row) => Number(row.template_id) === Number(template.id) && String(row.status) === 'completed'
                );
                const earned = completedRow
                  ? criteriaOf(template).reduce((s, c) => s + Number(completedRow.scores?.[c.id]?.score || 0), 0)
                  : 0;
                return (
                  <div key={template.id} className="glass rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-display font-semibold">{template.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {typeLabel(template.type)}
                          {template.description ? ` — ${template.description}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {completedRow && <Badge tone="success">Submitted ({earned.toFixed(0)} / 55)</Badge>}
                      {completedRow && !completedRow.employee_acknowledged && (
                        <button
                          type="button"
                          onClick={() => acknowledgeEvaluation(completedRow)}
                          disabled={busyId === completedRow.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                        >
                          <Check size={13} /> Acknowledge
                        </button>
                      )}
                      {completedRow?.employee_acknowledged && <Badge tone="default">Acknowledged</Badge>}
                      {!completedRow && (
                        <button
                          type="button"
                          onClick={() => openAnswerForm(template)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          <Pencil size={13} /> {draftRow ? 'Continue draft' : 'Answer form'}
                        </button>
                      )}
                      {draftRow && (
                        <button
                          type="button"
                          onClick={() => deleteEvaluation(draftRow)}
                          disabled={busyId === draftRow.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose/20 bg-rose/10 px-3 py-1.5 text-xs font-semibold text-rose disabled:opacity-50"
                        >
                          <Trash2 size={13} /> Discard draft
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {answer.template && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveEvaluation('completed');
              }}
              className="glass rounded-2xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-semibold">{answer.template.name}</h3>
                <Badge tone="default">{typeLabel(answer.template.type)}</Badge>
              </div>

              <label className="block text-xs font-semibold text-muted-foreground">
                Review period
                <input
                  value={answer.reviewPeriod}
                  onChange={(event) => setAnswer({ ...answer, reviewPeriod: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
                  placeholder="e.g. 2026-10"
                  required
                />
              </label>

              {(answer.template.sections || []).map((section) => (
                <div key={section.id} className="rounded-xl border border-border bg-white p-4 space-y-3">
                  <h4 className="text-sm font-semibold">{section.name}</h4>
                  {section.criteria.map((criterion) => (
                    <div key={criterion.id} className="grid gap-2 sm:grid-cols-[auto_1fr]">
                      <select
                        value={answer.scores[criterion.id]?.score ?? 0}
                        onChange={(event) => {
                          const clamped = Math.min(Math.max(Number(event.target.value) || 0, 0), 5);
                          const scores = { ...answer.scores };
                          scores[criterion.id] = {
                            score: clamped,
                            comment: scores[criterion.id]?.comment || '',
                          };
                          setAnswer({ ...answer, scores });
                        }}
                        className="w-44 rounded-lg border border-border bg-white px-2 py-2 text-sm"
                        aria-label="Score"
                      >
                        {[0, 1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {SCORE_WORDS[value]}
                          </option>
                        ))}
                      </select>
                      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                        <p className="text-sm font-medium">{criterion.name?.trim() || 'Criterion'}</p>
                        {criterion.description ? (
                          <p className="text-xs text-muted-foreground">{criterion.description}</p>
                        ) : null}
                        <input
                          value={answer.scores[criterion.id]?.comment || ''}
                          onChange={(event) => {
                            const scores = { ...answer.scores };
                            scores[criterion.id] = {
                              score: scores[criterion.id]?.score || 0,
                              comment: event.target.value,
                            };
                            setAnswer({ ...answer, scores });
                          }}
                          className="mt-1 w-full rounded-md border border-border bg-white px-2 py-1 text-xs"
                          placeholder="Comment (optional)"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Score credit total: <strong>{criteriaOf(answer.template).reduce((s, c) => s + Number(answer.scores[c.id]?.score || 0), 0)}</strong> / 55
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveEvaluation('draft')}
                    disabled={saving}
                    className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-semibold disabled:opacity-60"
                  >
                    Save draft
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    <Save size={14} /> Submit evaluation
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ---------- Report tab (admin/manager only) ---------- */}
      {isManagerLike && tab === 'report' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={printReport}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold"
            >
              <Printer size={14} /> Print
            </button>
            <span className="text-xs text-muted-foreground">
              Percentage = score credit total ÷ 55 × 100 (completed evaluations).
            </span>
          </div>

          {reportRows.length === 0 ? (
            <EmptyState
              label={`No ${effectiveRole === 'admin' ? 'staff or managers' : 'staff'} in your department`}
            />
          ) : (
            <div id="evaluation-report" className="glass overflow-x-auto rounded-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Completed forms</th>
                    <th className="px-4 py-3">Score credit total</th>
                    <th className="px-4 py-3">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.subject.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{row.subject.name}</td>
                      <td className="px-4 py-3 text-xs uppercase">{row.subject.role}</td>
                      <td className="px-4 py-3">{row.completed}</td>
                      <td className="px-4 py-3">{row.total.toFixed(0)} / 55</td>
                      <td className="px-4 py-3 font-semibold">{row.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
