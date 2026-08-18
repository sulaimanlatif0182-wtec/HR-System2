import apiClient from '../../lib/api';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList,
  Save,
  Trash2,
  Loader2,
  RefreshCw,
  Printer,
  Pencil,
  Check,
  UserRound,
  Settings2,
  Star,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { printDocument } from '../../lib/print';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/ui';

interface Employee {
  id: number;
  name: string;
  category?: string | null;
  department?: string | null;
  employee_no?: string | null;
  title?: string | null;
}

interface TemplateCriterion {
  id: string;
  name: string;
  max_score: number;
  description?: string | null;
}

interface TemplateSection {
  id: string;
  name: string;
  criteria: TemplateCriterion[];
}

interface EvaluationTemplate {
  id: number;
  name: string;
  category: string;
  department?: string | null;
  description?: string | null;
  sections: TemplateSection[];
  status?: string | null;
}

interface Evaluation {
  id: number;
  template_id: number;
  employee_id: number;
  evaluator_id?: number | null;
  evaluator_name?: string | null;
  evaluator_role?: string | null;
  review_period: string;
  status: string;
  scores: Record<string, { score: number; comment?: string | null }>;
  overall_score: number;
  employee_acknowledged?: boolean | null;
  employee_acknowledged_at?: string | null;
  acknowledged_by_name?: string | null;
  created_at?: string;
}

interface WorkerRule {
  id: number;
  employee_id: number;
  template_id: number | null;
  criteria: TemplateCriterion[];
  active?: boolean;
}

interface TemplateDraft {
  id?: number;
  name: string;
  category: string;
  department: string;
  description: string;
  status: 'active' | 'inactive';
  sections: {
    id: string;
    name: string;
    criteria: {
      id: string;
      name: string;
      max_score: number;
      description: string;
    }[];
  }[];
}

const CATEGORIES = ['worker', 'employee', 'manager'] as const;

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const EMPTY_TEMPLATE = (): TemplateDraft => ({
  name: '',
  category: 'worker',
  department: '',
  description: '',
  status: 'active',
  sections: [{ id: uid(), name: '', criteria: [{ id: uid(), name: '', max_score: 5, description: '' }] }],
});

function flattenCriteria(sections: TemplateSection[]): TemplateCriterion[] {
  return (sections || []).flatMap((section) => section.criteria || []);
}

function computeOverall(scores: Record<string, { score: number }>, sections: TemplateSection[]): number {
  const criteria = flattenCriteria(sections);
  if (!criteria.length) return 0;

  let earned = 0;
  let max = 0;

  for (const criterion of criteria) {
    const entry = scores?.[criterion.id];
    const score = Math.max(0, Math.min(Number(entry?.score) || 0, criterion.max_score));
    earned += score;
    max += criterion.max_score;
  }

  return max > 0 ? Math.round((earned / max) * 100) : 0;
}

export default function Evaluation() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const canEvaluate = isAdmin || isManager;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [rules, setRules] = useState<WorkerRule[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [adminView, setAdminView] = useState<'templates' | 'rules' | 'evaluations'>(
    searchParams.get('view') === 'rules'
      ? 'rules'
      : searchParams.get('view') === 'templates'
        ? 'templates'
        : 'evaluations'
  );

  const [subjectId, setSubjectId] = useState<number | ''>(profile?.id ?? '');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [reviewPeriod, setReviewPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({});
  const [editingId, setEditingId] = useState<number | null>(null);

  const [templateForm, setTemplateForm] = useState<TemplateDraft>(EMPTY_TEMPLATE());
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [ruleEmployeeId, setRuleEmployeeId] = useState<number | ''>(
    searchParams.get('employee') ? Number(searchParams.get('employee')) : ''
  );
  const [ruleTemplateId, setRuleTemplateId] = useState<number | ''>('');
  const [ruleCriteria, setRuleCriteria] = useState<Set<string>>(new Set());
  const [ruleActive, setRuleActive] = useState(true);

  const fetchAll = async () => {
    try {
      const [emp, templateData, evaluationData, ruleData] = await Promise.all([
        apiClient.get('/api/employees'),
        apiClient.get('/api/employees?evaluation_templates=true'),
        apiClient.get(
          canEvaluate
            ? '/api/employees?evaluations=true'
            : `/api/employees?evaluations=true&employee_id=${profile?.id}`
        ),
        isAdmin ? apiClient.get('/api/employees?worker_rules=true') : Promise.resolve([]),
      ]);

      setEmployees(Array.isArray(emp) ? emp : []);
      setTemplates(Array.isArray(templateData) ? templateData : []);
      setEvaluations(Array.isArray(evaluationData) ? evaluationData : []);
      setRules(Array.isArray(ruleData) ? ruleData : []);
    } catch {
      setError('Failed to load evaluation data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await fetchAll();
    })();
  }, [profile?.id]);

  const employeesMap = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

  const departments = useMemo(
    () =>
      Array.from(new Set(employees.map((employee) => employee.department).filter(Boolean))).sort() as string[],
    [employees]
  );

  const subjects = useMemo<{ value: number; label: string; category?: string | null; department?: string | null }[]>(() => {
    if (!profile) return [];

    if (isAdmin) {
      return employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        category: employee.category,
        department: employee.department,
      }));
    }

    if (isManager) {
      const dept = profile.department;
      const workers = employees.filter(
        (employee) =>
          employee.category === 'worker' &&
          (!dept || employee.department === dept || !employee.department)
      );

      const list = [
        { value: profile.id, label: `${profile.name} (me)`, category: profile.category, department: profile.department },
        ...(workers.length
          ? workers.map((employee) => ({
              value: employee.id,
              label: `${employee.name} (worker)`,
              category: employee.category,
              department: employee.department,
            }))
          : employees
              .filter((employee) => employee.category === 'worker')
              .map((employee) => ({
                value: employee.id,
                label: `${employee.name} (worker)`,
                category: employee.category,
                department: employee.department,
              }))),
      ];

      return list;
    }

    return [
      {
        value: profile.id,
        label: profile.name,
        category: profile.category,
        department: profile.department,
      },
    ];
  }, [employees, profile, isAdmin, isManager]);

  const selectedTemplate = useMemo(() => {
    if (!subjectId) return null;

    const subject = subjects.find((item) => item.value === subjectId);
    if (!subject) return null;

    const rule = rules.find(
      (r) => r.employee_id === subjectId && r.active && r.template_id
    );

    if (rule?.template_id) {
      const template = templates.find((t) => t.id === rule.template_id);
      if (template) return template;
    }

    const fallback = templates.find(
      (template) =>
        template.status !== 'inactive' &&
        template.category === (subject.category || 'worker') &&
        (!template.department || template.department === subject.department || !subject.department)
    );

    if (fallback) return fallback;

    return templates.find((template) => template.status !== 'inactive') || null;
  }, [subjectId, subjects, rules, templates]);

  const activeCriteria = useMemo(() => {
    if (!selectedTemplate) return [];

    const subject = subjects.find((item) => item.value === subjectId);
    const rule = subject
      ? rules.find((r) => r.employee_id === subject.value && r.active && r.template_id)
      : null;

    if (rule?.criteria?.length) {
      const ids = new Set(rule.criteria.map((criterion) => criterion.id));
      return flattenCriteria(selectedTemplate.sections).filter((criterion) => ids.has(criterion.id));
    }

    return flattenCriteria(selectedTemplate.sections);
  }, [selectedTemplate, subjectId, subjects, rules]);

  const overall = useMemo(
    () => computeOverall(scores, selectedTemplate?.sections || []),
    [scores, selectedTemplate]
  );

  const resetForm = () => {
    setEditingId(null);
    setScores({});
  };

  const handleSubjectChange = (next: number | '') => {
    setSubjectId(next);
    setEditingId(null);
    setScores({});
    if (next) {
      const subject = subjects.find((item) => item.value === next);
      const rule = subject ? rules.find((r) => r.employee_id === subject.value && r.active) : null;
      setTemplateId(rule?.template_id ?? '');
    } else {
      setTemplateId('');
    }
  };

  const setScore = (criterionId: string, field: 'score' | 'comment', value: string) => {
    setScores((prev) => ({
      ...prev,
      [criterionId]: {
        score: field === 'score' ? Math.max(0, Number(value) || 0) : prev[criterionId]?.score ?? 0,
        comment: field === 'comment' ? value : prev[criterionId]?.comment ?? '',
      },
    }));
  };

  const handleSave = async (status: 'draft' | 'completed') => {
    if (!subjectId || !selectedTemplate) {
      setError('Choose an employee and make sure a template is available.');
      return;
    }

    if (!reviewPeriod.trim()) {
      setError('Review period is required.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await apiClient.post('/api/employees', {
        action: 'evaluation_save',
        actor_role: profile?.role,
        id: editingId ?? undefined,
        template_id: selectedTemplate.id,
        employee_id: subjectId,
        review_period: reviewPeriod.trim(),
        scores,
        status,
        evaluator_id: profile?.id,
        evaluator_name: profile?.name,
        evaluator_role: profile?.role,
        changed_by: profile?.id,
        changed_by_name: profile?.name,
      });

      setMessage(status === 'completed' ? 'Evaluation submitted.' : 'Draft saved.');
      setEditingId(null);
      setScores({});
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save evaluation.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (evaluation: Evaluation) => {
    setSubjectId(evaluation.employee_id);
    setTemplateId(evaluation.template_id);
    setReviewPeriod(evaluation.review_period);
    setScores(
      Object.fromEntries(
        Object.entries(evaluation.scores || {}).map(([key, value]) => [
          key,
          { score: Number(value.score) || 0, comment: String(value.comment || '') },
        ])
      )
    );
    setEditingId(evaluation.id);
    setAdminView('evaluations');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (evaluation: Evaluation) => {
    if (!window.confirm(`Delete the evaluation for ${employeesMap[evaluation.employee_id]?.name || 'this employee'}?`)) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiClient.post('/api/employees', {
        action: 'evaluation_delete',
        actor_role: profile?.role,
        id: evaluation.id,
        changed_by: profile?.id,
        changed_by_name: profile?.name,
      });

      if (editingId === evaluation.id) resetForm();
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete evaluation.');
    } finally {
      setSaving(false);
    }
  };

  const handleAcknowledge = async (evaluation: Evaluation) => {
    setSaving(true);
    setError('');

    try {
      await apiClient.post('/api/employees', {
        action: 'evaluation_acknowledge',
        id: evaluation.id,
        employee_id: profile?.id,
        employee_name: profile?.name,
      });

      setMessage('Evaluation acknowledged.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to acknowledge evaluation.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = (evaluation: Evaluation) => {
    const template = templates.find((t) => t.id === evaluation.template_id);
    const employee = employeesMap[evaluation.employee_id];

    const sections = (template?.sections || []).map((section) => {
      const rows = (section.criteria || [])
        .map((criterion) => {
          const entry = evaluation.scores?.[criterion.id];
          const score = Number(entry?.score) || 0;
          return `<tr>
            <td style="padding:8px;border:1px solid #d1d5db">${criterion.name}</td>
            <td style="padding:8px;border:1px solid #d1d5db;text-align:center">${score} / ${criterion.max_score}</td>
            <td style="padding:8px;border:1px solid #d1d5db">${entry?.comment || '—'}</td>
          </tr>`;
        })
        .join('');

      return `<h3 style="margin:16px 0 8px">${section.name}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead><tr>
            <th style="padding:8px;border:1px solid #d1d5db;text-align:left">Criterion</th>
            <th style="padding:8px;border:1px solid #d1d5db">Score</th>
            <th style="padding:8px;border:1px solid #d1d5db;text-align:left">Comments</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join('');

    printDocument({
      title: `Evaluation - ${employee?.name || ''}`,
      docTitle: template?.name || 'Evaluation',
      subtitle: `${employee?.name || ''} · ${evaluation.review_period}`,
      bodyHtml: `
      <div style="display:flex;gap:24px;margin-bottom:20px">
        <div><strong>Overall score</strong><br/>${evaluation.overall_score}%</div>
        <div><strong>Status</strong><br/>${evaluation.status}</div>
        <div><strong>Evaluator</strong><br/>${evaluation.evaluator_name || '—'}</div>
      </div>
      ${sections}`,
    });
  };

  const saveTemplate = async (e: FormEvent) => {
    e.preventDefault();

    if (!templateForm.name.trim()) {
      setError('Template name is required.');
      return;
    }

    const sections = templateForm.sections
      .filter((section) => section.name.trim())
      .map((section) => ({
        id: section.id,
        name: section.name.trim(),
        criteria: section.criteria
          .filter((criterion) => criterion.name.trim())
          .map((criterion) => ({
            id: criterion.id,
            name: criterion.name.trim(),
            max_score: Math.max(1, Number(criterion.max_score) || 5),
            description: criterion.description.trim() || null,
          })),
      }));

    if (!sections.length || !sections.some((section) => section.criteria.length)) {
      setError('Template must contain at least one section with scored criteria.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await apiClient.post('/api/employees', {
        action: 'template_save',
        actor_role: profile?.role,
        id: templateForm.id,
        name: templateForm.name,
        category: templateForm.category,
        department: templateForm.department.trim() || null,
        description: templateForm.description.trim() || null,
        sections,
        status: templateForm.status,
        changed_by: profile?.id,
        changed_by_name: profile?.name,
      });

      setMessage(templateForm.id ? 'Template updated.' : 'Template created.');
      setShowTemplateForm(false);
      setTemplateForm(EMPTY_TEMPLATE());
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template.');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template: EvaluationTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;

    setSaving(true);
    setError('');

    try {
      await apiClient.post('/api/employees', {
        action: 'template_delete',
        actor_role: profile?.role,
        id: template.id,
        changed_by: profile?.id,
        changed_by_name: profile?.name,
      });

      setMessage('Template deleted.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete template.');
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async (e: FormEvent) => {
    e.preventDefault();

    if (!ruleEmployeeId) {
      setError('Select an employee for the rule.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await apiClient.post('/api/employees', {
        action: 'worker_rule_save',
        actor_role: profile?.role,
        employee_id: ruleEmployeeId,
        template_id: ruleTemplateId || null,
        criteria: Array.from(ruleCriteria),
        active: ruleActive,
        changed_by: profile?.id,
        changed_by_name: profile?.name,
      });

      setMessage('Evaluation rule saved.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleRuleTemplateChange = (next: number | '') => {
    setRuleTemplateId(next);
    setRuleCriteria(new Set());

    const template = templates.find((t) => t.id === next);
    if (template) {
      setRuleCriteria(new Set(flattenCriteria(template.sections).map((criterion) => criterion.id)));
    }
  };

  const visibleEvaluations = useMemo(() => {
    if (isAdmin) return evaluations;

    if (isManager) {
      return evaluations.filter(
        (evaluation) =>
          evaluation.evaluator_id === profile?.id || evaluation.employee_id === profile?.id
      );
    }

    return evaluations.filter((evaluation) => evaluation.employee_id === profile?.id);
  }, [evaluations, isAdmin, isManager, profile?.id]);

  const ruleEmployee = employeesMap[ruleEmployeeId];

  if (loading) return <LoadingState label="Loading evaluation module…" />;
  if (error && !templates.length && !evaluations.length) {
    return <ErrorState message={error} onRetry={fetchAll} />;
  }

  const badgeTone = (value: string) => {
    if (value === 'completed') return 'success';
    if (value === 'draft') return 'warning';
    return 'neutral';
  };

  return (
    <div>
      <PageHeader
        title="Performance / Evaluation"
        subtitle="Templates, worker rules and scored evaluations."
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

      {isAdmin && (
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-surface p-1 w-fit mb-6">
          {(
            [
              { key: 'templates', label: 'Templates' },
              { key: 'rules', label: 'Rules' },
              { key: 'evaluations', label: 'Evaluations' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setAdminView(item.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                adminView === item.key
                  ? 'bg-gradient-to-r from-primary to-primary-2 text-white shadow-lg shadow-primary/30'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {item.key === 'templates' ? (
                <Settings2 size={15} />
              ) : item.key === 'rules' ? (
                <UserRound size={15} />
              ) : (
                <ClipboardList size={15} />
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-rose/20 bg-rose/10 px-4 py-3 text-sm text-rose">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-5 rounded-xl border border-emerald/20 bg-emerald/10 px-4 py-3 text-sm text-emerald">
          {message}
        </div>
      )}

      {isAdmin && adminView === 'templates' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-lg">Evaluation templates</h3>
              <p className="text-sm text-muted">
                Templates define scored sections and criteria per employee category.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTemplateForm(EMPTY_TEMPLATE());
                setShowTemplateForm((prev) => !prev);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30"
            >
              {showTemplateForm ? 'Close editor' : 'New template'}
            </button>
          </div>

          {showTemplateForm && (
            <form onSubmit={saveTemplate} className="glass rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Template name *</label>
                  <input
                    required
                    value={templateForm.name}
                    onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })}
                    placeholder="e.g. Worker performance 2026"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Category</label>
                  <select
                    value={templateForm.category}
                    onChange={(event) => setTemplateForm({ ...templateForm, category: event.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Department (optional)</label>
                  <select
                    value={templateForm.department}
                    onChange={(event) => setTemplateForm({ ...templateForm, department: event.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="">All departments</option>
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Status</label>
                  <select
                    value={templateForm.status}
                    onChange={(event) =>
                      setTemplateForm({ ...templateForm, status: event.target.value as 'active' | 'inactive' })
                    }
                    className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={templateForm.description}
                  onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })}
                  placeholder="Short description of this template."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Sections & criteria</h4>
                  <button
                    type="button"
                    onClick={() =>
                      setTemplateForm({
                        ...templateForm,
                        sections: [
                          ...templateForm.sections,
                          { id: uid(), name: '', criteria: [{ id: uid(), name: '', max_score: 5, description: '' }] },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold"
                  >
                    + Add section
                  </button>
                </div>

                {templateForm.sections.map((section, sectionIndex) => (
                  <div key={section.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        value={section.name}
                        onChange={(event) => {
                          const sections = [...templateForm.sections];
                          sections[sectionIndex] = { ...section, name: event.target.value };
                          setTemplateForm({ ...templateForm, sections });
                        }}
                        placeholder="Section name (e.g. Quality of work)"
                        className="flex-1 rounded-xl border border-white/10 bg-surface px-4 py-2 text-sm outline-none focus:border-primary/50"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setTemplateForm({
                            ...templateForm,
                            sections: templateForm.sections.filter((_, index) => index !== sectionIndex),
                          })
                        }
                        className="rounded-lg border border-rose/20 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="space-y-2">
                      {section.criteria.map((criterion, criterionIndex) => (
                        <div key={criterion.id} className="grid grid-cols-1 md:grid-cols-[1fr_90px_1fr_auto] gap-2">
                          <input
                            value={criterion.name}
                            onChange={(event) => {
                              const sections = [...templateForm.sections];
                              sections[sectionIndex] = {
                                ...section,
                                criteria: section.criteria.map((item, index) =>
                                  index === criterionIndex ? { ...item, name: event.target.value } : item
                                ),
                              };
                              setTemplateForm({ ...templateForm, sections });
                            }}
                            placeholder="Criterion name"
                            className="rounded-xl border border-white/10 bg-surface px-4 py-2 text-sm outline-none focus:border-primary/50"
                          />
                          <input
                            type="number"
                            min={1}
                            value={criterion.max_score}
                            onChange={(event) => {
                              const sections = [...templateForm.sections];
                              sections[sectionIndex] = {
                                ...section,
                                criteria: section.criteria.map((item, index) =>
                                  index === criterionIndex
                                    ? { ...item, max_score: Math.max(1, Number(event.target.value) || 5) }
                                    : item
                                ),
                              };
                              setTemplateForm({ ...templateForm, sections });
                            }}
                            placeholder="Max"
                            className="rounded-xl border border-white/10 bg-surface px-4 py-2 text-sm outline-none focus:border-primary/50"
                          />
                          <input
                            value={criterion.description}
                            onChange={(event) => {
                              const sections = [...templateForm.sections];
                              sections[sectionIndex] = {
                                ...section,
                                criteria: section.criteria.map((item, index) =>
                                  index === criterionIndex ? { ...item, description: event.target.value } : item
                                ),
                              };
                              setTemplateForm({ ...templateForm, sections });
                            }}
                            placeholder="Description (optional)"
                            className="rounded-xl border border-white/10 bg-surface px-4 py-2 text-sm outline-none focus:border-primary/50"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const sections = [...templateForm.sections];
                              sections[sectionIndex] = {
                                ...section,
                                criteria: section.criteria.filter((_, index) => index !== criterionIndex),
                              };
                              setTemplateForm({ ...templateForm, sections });
                            }}
                            className="rounded-lg border border-rose/20 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const sections = [...templateForm.sections];
                          sections[sectionIndex] = {
                            ...section,
                            criteria: [...section.criteria, { id: uid(), name: '', max_score: 5, description: '' }],
                          };
                          setTemplateForm({ ...templateForm, sections });
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        + Add criterion
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {templateForm.id ? 'Update template' : 'Create template'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {templates.map((template) => {
              const criteria = flattenCriteria(template.sections);
              const sectionCount = (template.sections || []).length;

              return (
                <div key={template.id} className="glass rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{template.name}</h4>
                      <p className="text-xs text-muted mt-0.5">
                        {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
                        {template.department ? ` · ${template.department}` : ' · All departments'}
                      </p>
                    </div>
                    <Badge tone={template.status === 'inactive' ? 'neutral' : 'success'}>
                      {template.status === 'inactive' ? 'Inactive' : 'Active'}
                    </Badge>
                  </div>

                  {template.description && (
                    <p className="text-sm text-muted line-clamp-2">{template.description}</p>
                  )}

                  <p className="text-xs text-muted">
                    {sectionCount} section{sectionCount === 1 ? '' : 's'} · {criteria.length} criteria
                  </p>

                  <div className="mt-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateForm({
                          id: template.id,
                          name: template.name,
                          category: template.category,
                          department: template.department || '',
                          description: template.description || '',
                          status: template.status === 'inactive' ? 'inactive' : 'active',
                          sections: template.sections.map((section) => ({
                            id: section.id,
                            name: section.name,
                            criteria: section.criteria.map((criterion) => ({
                              id: criterion.id,
                              name: criterion.name,
                              max_score: criterion.max_score,
                              description: criterion.description || '',
                            })),
                          })),
                        });
                        setShowTemplateForm(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(template)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose/20 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!templates.length && (
            <EmptyState label="No templates yet. Create your first evaluation template to get started." />
          )}
        </div>
      )}

      {isAdmin && adminView === 'rules' && (
        <form onSubmit={saveRule} className="glass rounded-2xl p-5 space-y-4 max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
              <UserRound size={20} />
            </div>
            <div>
              <h3 className="font-display font-semibold">Evaluation rules</h3>
              <p className="text-xs text-muted">
                Assign a template and criteria for each employee. This controls what the worker sees when
                evaluated.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">Employee</label>
              <select
                value={ruleEmployeeId}
                onChange={(event) => setRuleEmployeeId(event.target.value ? Number(event.target.value) : '')}
                className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
              >
                <option value="">Select employee…</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                    {employee.category ? ` (${employee.category})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Template</label>
              <select
                value={ruleTemplateId}
                onChange={(event) => handleRuleTemplateChange(event.target.value ? Number(event.target.value) : '')}
                className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
              >
                <option value="">No template (disabled)</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {ruleEmployee && rules.find((rule) => rule.employee_id === ruleEmployee.id) && (
            <p className="text-xs text-muted rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
              This employee already has a rule. Saving will update it.
            </p>
          )}

          {ruleTemplateId ? (
            <div>
              <label className="block text-xs text-muted mb-1.5">Active criteria</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {flattenCriteria(templates.find((template) => template.id === ruleTemplateId)?.sections || []).map(
                  (criterion) => (
                    <label
                      key={criterion.id}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={ruleCriteria.has(criterion.id)}
                        onChange={(event) => {
                          const next = new Set(ruleCriteria);
                          if (event.target.checked) next.add(criterion.id);
                          else next.delete(criterion.id);
                          setRuleCriteria(next);
                        }}
                        className="accent-primary"
                      />
                      <span>{criterion.name}</span>
                      <span className="text-xs text-muted ml-auto">/ {criterion.max_score}</span>
                    </label>
                  )
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No template selected — the employee will be treated as excluded from scoring.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ruleActive}
              onChange={(event) => setRuleActive(event.target.checked)}
              className="accent-primary"
            />
            Rule active
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save rule
            </button>
          </div>
        </form>
      )}

      {(adminView === 'evaluations' || !isAdmin) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {canEvaluate && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave(selectedTemplate && activeCriteria.length ? 'completed' : 'draft');
              }}
              className="glass rounded-2xl p-5 space-y-3 h-fit"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
                  <Star size={20} />
                </div>
                <div>
                  <h3 className="font-display font-semibold">
                    {editingId ? 'Edit evaluation' : isManager ? 'Evaluate employee' : 'Evaluation form'}
                  </h3>
                  <p className="text-xs text-muted">
                    {isManager
                      ? 'Switch the subject to evaluate a worker under you, or evaluate yourself.'
                      : 'Select a subject, score criteria and submit.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Subject</label>
                  <select
                    value={subjectId}
                    onChange={(event) => handleSubjectChange(event.target.value ? Number(event.target.value) : '')}
                    className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="">Select subject…</option>
                    {subjects.map((subject) => (
                      <option key={subject.value} value={subject.value}>
                        {subject.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Review period</label>
                  <input
                    required
                    type="month"
                    value={reviewPeriod}
                    onChange={(event) => setReviewPeriod(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">Template</label>
                <select
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value ? Number(event.target.value) : '');
                    setEditingId(null);
                    setScores({});
                  }}
                  className="w-full rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary/50"
                >
                  <option value="">Auto-selected</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.category})
                    </option>
                  ))}
                </select>
                {!selectedTemplate && (
                  <p className="text-xs text-amber mt-1.5">
                    No matching active template found for this subject. Create or activate a template.
                  </p>
                )}
              </div>

              {selectedTemplate && (
                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                  {selectedTemplate.sections.map((section) => {
                    const criteria = activeCriteria.length
                      ? section.criteria.filter((criterion) =>
                          activeCriteria.some((active) => active.id === criterion.id)
                        )
                      : section.criteria;

                    if (!criteria.length) return null;

                    return (
                      <div key={section.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                        <h4 className="text-sm font-semibold">{section.name}</h4>
                        {criteria.map((criterion) => {
                          const entry = scores[criterion.id] || { score: 0, comment: '' };
                          const percentage =
                            criterion.max_score > 0 ? Math.round((entry.score / criterion.max_score) * 100) : 0;

                          return (
                            <div key={criterion.id}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">
                                  {criterion.name}
                                  <span className="text-muted font-normal"> / {criterion.max_score}</span>
                                </span>
                                <span className="text-xs text-muted">{percentage}%</span>
                              </div>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-[130px_1fr] gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={criterion.max_score}
                                  value={entry.score}
                                  onChange={(event) => setScore(criterion.id, 'score', event.target.value)}
                                  placeholder={`0-${criterion.max_score}`}
                                  className="rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50"
                                />
                                <input
                                  value={entry.comment}
                                  onChange={(event) => setScore(criterion.id, 'comment', event.target.value)}
                                  placeholder="Comments (optional)"
                                  className="rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50"
                                />
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-2"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedTemplate && (
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <div>
                    <p className="text-xs text-muted">Overall score</p>
                    <p className="font-display text-2xl font-bold">{overall}%</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSave('draft')}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Save draft
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Submit completed
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-lg">Evaluations</h3>
              <span className="text-xs text-muted">{visibleEvaluations.length} record(s)</span>
            </div>

            {!visibleEvaluations.length && (
              <EmptyState
                label={
                  canEvaluate
                    ? 'No evaluations yet. Submit an evaluation using the form to get started.'
                    : 'No evaluations have been shared with you yet.'
                }
              />
            )}

            {visibleEvaluations.map((evaluation) => {
              const employee = employeesMap[evaluation.employee_id];
              const template = templates.find((template) => template.id === evaluation.template_id);
              const isMine = evaluation.employee_id === profile?.id;
              const canEdit = isAdmin || evaluation.evaluator_id === profile?.id;

              return (
                <div key={evaluation.id} className="glass rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
                        <UserRound size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold">
                          {employee?.name || `Employee #${evaluation.employee_id}`}
                          {employee?.employee_no ? (
                            <span className="text-xs text-muted font-normal ml-2">#{employee.employee_no}</span>
                          ) : null}
                        </h4>
                        <p className="text-xs text-muted">
                          {template?.name || 'Template'} · {evaluation.review_period}
                        </p>
                      </div>
                    </div>
                    <Badge tone={badgeTone(evaluation.status)}>{evaluation.status}</Badge>
                  </div>

                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-muted">Overall</p>
                      <p className="text-lg font-bold">{evaluation.overall_score}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Evaluator</p>
                      <p className="text-sm">{evaluation.evaluator_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Acknowledged</p>
                      <p className="text-sm">
                        {evaluation.employee_acknowledged ? 'Yes' : 'No'}
                        {evaluation.acknowledged_by_name ? ` · ${evaluation.acknowledged_by_name}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrint(evaluation)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                    >
                      <Printer size={14} /> Print
                    </button>

                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(evaluation)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(evaluation)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose/20 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </>
                    )}

                    {isMine && evaluation.status === 'completed' && !evaluation.employee_acknowledged && (
                      <button
                        type="button"
                        onClick={() => handleAcknowledge(evaluation)}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-2 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-primary/30 disabled:opacity-60"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
