import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, Save, Printer, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

interface Employee { id: number; name: string; email?: string | null; title?: string | null; department?: string | null; join_date?: string | null; }
interface HrLetter { id: number; employee_id: number; template_type: string; title: string; content: string; status: string; generated_by_name?: string | null; created_at: string; }

const TEMPLATE_TYPES = [
  'Employment Verification Letter',
  'Salary Increment Letter',
  'Promotion Letter',
  'Warning Letter',
  'Show Cause Letter',
  'Resignation Acceptance Letter',
  'General HR Letter',
];

function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString() : '—'; }

function buildTemplate(type: string, employee?: Employee) {
  const name = employee?.name ?? '[Employee Name]';
  const title = employee?.title ?? '[Job Title]';
  const department = employee?.department ?? '[Department]';
  const date = today();

  if (type === 'Employment Verification Letter') {
    return `Date: ${date}\n\nTo Whom It May Concern,\n\nThis is to certify that ${name} is employed with WTEC as ${title} under the ${department} department.\n\nThis letter is issued upon employee request for official use.\n\nSincerely,\nHuman Resource Department`;
  }
  if (type === 'Salary Increment Letter') {
    return `Date: ${date}\n\nDear ${name},\n\nWe are pleased to inform you that your salary has been reviewed and adjusted effective [Effective Date].\n\nPlease refer to your official payroll record for the updated salary details.\n\nSincerely,\nHuman Resource Department`;
  }
  if (type === 'Promotion Letter') {
    return `Date: ${date}\n\nDear ${name},\n\nWe are pleased to inform you that you have been promoted to [New Position] effective [Effective Date].\n\nWe appreciate your contribution and look forward to your continued success.\n\nSincerely,\nHuman Resource Department`;
  }
  if (type === 'Warning Letter') {
    return `Date: ${date}\n\nDear ${name},\n\nThis letter serves as an official warning regarding [Issue/Incident].\n\nYou are required to improve immediately and comply with company policies.\n\nSincerely,\nHuman Resource Department`;
  }
  if (type === 'Show Cause Letter') {
    return `Date: ${date}\n\nDear ${name},\n\nYou are required to provide a written explanation regarding [Issue/Incident] by [Deadline].\n\nFailure to respond may result in further disciplinary action.\n\nSincerely,\nHuman Resource Department`;
  }
  return `Date: ${date}\n\nDear ${name},\n\n[Write letter content here]\n\nSincerely,\nHuman Resource Department`;
}

export default function HrLetters() {
  const { profile } = useAuth();
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [letters, setLetters] = useState<HrLetter[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [templateType, setTemplateType] = useState(TEMPLATE_TYPES[0]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchAll = async () => {
    setLoading(true); setError('');
    try {
      const [emp, letterData] = await Promise.all([
        fetch('/api/employees').then((r) => r.json()),
        fetch('/api/employees?hr_letters=true').then((r) => r.json()),
      ]);
      setEmployees(Array.isArray(emp) ? emp : []);
      setLetters(Array.isArray(letterData) ? letterData : []);
    } catch { setError('Failed to load HR letters.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const selectedEmployee = useMemo(() => employees.find((e) => e.id === Number(employeeId)), [employees, employeeId]);

  const generate = () => {
    setTitle(`${templateType} - ${selectedEmployee?.name ?? ''}`.trim());
    setContent(buildTemplate(templateType, selectedEmployee));
  };

  const saveLetter = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !employeeId || !title || !content) { setMessage('Employee, title and content are required.'); return; }
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hr_letter_save', employee_id: Number(employeeId), template_type: templateType, title, content, status: 'final', changed_by: profile.id, changed_by_name: profile.name }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to save letter.');
      setMessage('Letter saved successfully.'); await fetchAll();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Failed to save letter.'); }
    finally { setSaving(false); }
  };

  const printContent = (letter?: HrLetter) => {
    const printTitle = letter?.title || title;
    const printBody = letter?.content || content;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return alert('Popup blocked. Please allow popups.');
    w.document.write(`<html><head><title>${printTitle}</title><style>body{font-family:Arial;padding:40px;line-height:1.6;white-space:pre-wrap}</style></head><body><h2>${printTitle}</h2><div>${printBody.replace(/</g, '&lt;')}</div><script>window.print()</script></body></html>`);
    w.document.close();
  };

  const deleteLetter = async (letter: HrLetter) => {
    if (!profile || !window.confirm(`Delete letter "${letter.title}"?`)) return;
    const res = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hr_letter_delete', id: letter.id, changed_by: profile.id, changed_by_name: profile.name }) });
    if (!res.ok) alert('Failed to delete letter.');
    await fetchAll();
  };

  if (!isAdminOrManager) return <ErrorState message="HR Letters are for Admin/Manager only." onRetry={() => undefined} />;
  if (loading) return <LoadingState label="Loading HR letters…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return <div>
    <PageHeader title="HR Letters Generator" subtitle="Generate, save and print common HR letters." action={<button onClick={fetchAll} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold"><RefreshCw size={16}/>Refresh</button>} />
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <form onSubmit={saveLetter} className="glass rounded-2xl p-5 space-y-3">
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <select value={templateType} onChange={(e) => setTemplateType(e.target.value)} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5">{TEMPLATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <button type="button" onClick={generate} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold">Generate Template</button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Letter title" className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5" />
        <textarea rows={14} value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 resize-none" />
        {message && <p className={`text-sm ${message.includes('success') ? 'text-emerald' : 'text-rose'}`}>{message}</p>}
        <div className="flex gap-2 justify-end"><button type="button" onClick={() => printContent()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5"><Printer size={16}/>Print</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}Save</button></div>
      </form>
      <div className="glass rounded-2xl p-5"><h3 className="font-display font-semibold mb-4">Saved Letters</h3>{letters.length===0?<EmptyState label="No letters generated yet."/>:<div className="space-y-2 max-h-[760px] overflow-y-auto">{letters.map(l=><div key={l.id} className="rounded-xl border border-white/10 bg-surface p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{l.title}</p><p className="text-xs text-muted">{employees.find(e=>e.id===l.employee_id)?.name ?? `#${l.employee_id}`} · {formatDate(l.created_at)}</p></div><Badge tone="info">{l.template_type}</Badge></div><div className="flex gap-2 mt-3"><button onClick={()=>printContent(l)} className="rounded-lg border border-white/10 bg-white/5 p-2"><Printer size={14}/></button><button onClick={()=>deleteLetter(l)} className="rounded-lg border border-rose/20 bg-rose/10 p-2 text-rose"><Trash2 size={14}/></button></div></div>)}</div>}</div>
    </div>
  </div>;
}
