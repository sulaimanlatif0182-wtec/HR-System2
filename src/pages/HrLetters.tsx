import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { Save, Printer, Trash2, Loader2, RefreshCw, Upload, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';
import apiClient from '../lib/api';
import { escapeHtml, printDocument } from '../lib/print';

interface Employee { id: number; name: string; email?: string | null; employee_no?: string | null; title?: string | null; department?: string | null; join_date?: string | null; salary?: number | null; }
interface HrLetter { id: number; employee_id: number; template_type: string; title: string; content: string; status: string; generated_by_name?: string | null; created_at: string; }
interface IncrementRow { employee_no?: string; email?: string; new_salary?: string | number; effective_date?: string; rowNumber: number; }

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

function buildTemplate(type: string, employee?: Employee, extra?: { effectiveDate?: string; newSalary?: number | string }) {
  const name = employee?.name ?? '[Employee Name]';
  const title = employee?.title ?? '[Job Title]';
  const department = employee?.department ?? '[Department]';
  const date = today();
  const effDate = extra?.effectiveDate || '[Effective Date]';

  if (type === 'Employment Verification Letter') {
    return `Date: ${date}\n\nTo Whom It May Concern,\n\nThis is to certify that ${name} is employed with WTEC as ${title} under the ${department} department.\n\nThis letter is issued upon employee request for official use.\n\nSincerely,\nHuman Resource Department`;
  }
  if (type === 'Salary Increment Letter') {
    const salaryLine = extra?.newSalary != null && String(extra.newSalary).trim() !== ''
      ? `Your revised monthly salary will be RM ${Number(extra.newSalary).toLocaleString()}, effective ${effDate}.`
      : `Your salary has been adjusted effective ${effDate}.`;
    return `Date: ${date}\n\nDear ${name},\n\nWe are pleased to inform you that your salary has been reviewed and approved for an increment.\n\n${salaryLine}\n\nPlease refer to your official payroll record for further details.\n\nSincerely,\nHuman Resource Department`;
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

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase().replace(/\s+/g, '_');
    if (keys.includes(norm)) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

async function parseIncrementFile(file: File): Promise<IncrementRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rows.map((row, i) => ({
    employee_no: pick(row, ['employee_no', 'employeeno', 'employee_id', 'emp_no', 'staff_no', 'staff_id', 'id']),
    email: pick(row, ['email', 'email_address', 'company_email']),
    new_salary: pick(row, ['new_salary', 'newsalary', 'salary', 'revised_salary', 'new_basic', 'basic_salary']),
    effective_date: pick(row, ['effective_date', 'effectivedate', 'effective_from', 'date_effective']),
    rowNumber: i + 2,
  })).filter(r => r.employee_no || r.email);
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

  // Bulk import state
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<IncrementRow[]>([]);
  const [importResult, setImportResult] = useState<{ generated: number; skipped: { row: number; reason: string }[] } | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);

  const fetchAll = async () => {
    try {
      const [emp, letterData] = await Promise.all([
        apiClient.get('/api/employees'),
        apiClient.get('/api/employees?hr_letters=true'),
      ]);
      setEmployees(Array.isArray(emp) ? emp : []);
      setLetters(Array.isArray(letterData) ? letterData : []);
    } catch { setError('Failed to load HR letters.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void (async () => { await fetchAll(); })(); }, []);

  const selectedEmployee = useMemo(() => employees.find((e) => e.id === Number(employeeId)), [employees, employeeId]);

  const findEmployeeForRow = (row: IncrementRow): Employee | undefined => {
    if (row.employee_no) {
      const byNo = employees.find(e => String(e.employee_no ?? '').trim().toLowerCase() === row.employee_no!.toLowerCase());
      if (byNo) return byNo;
    }
    if (row.email) {
      return employees.find(e => String(e.email ?? '').trim().toLowerCase() === row.email!.toLowerCase());
    }
    return undefined;
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(''); setImportResult(null); setImporting(true);
    try {
      const rows = await parseIncrementFile(file);
      if (!rows.length) { setMessage('No valid rows found. File needs an employee_no or email column.'); setParsedRows([]); return; }
      setParsedRows(rows);
      setMessage(`${rows.length} row(s) detected. Review below, then click "Generate & Save All".`);
    } catch {
      setMessage('Failed to parse file. Use .xlsx or .csv with employee_no / email columns.');
      setParsedRows([]);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const bulkGenerateAndSave = async () => {
    if (!profile) return;
    if (!parsedRows.length) { setMessage('Upload a file first.'); return; }
    setImporting(true); setMessage(''); setImportResult(null);
    const skipped: { row: number; reason: string }[] = [];
    let generated = 0;

    for (const row of parsedRows) {
      const emp = findEmployeeForRow(row);
      if (!emp) { skipped.push({ row: row.rowNumber, reason: `Employee not found (${row.employee_no || row.email})` }); continue; }

      const contentText = buildTemplate('Salary Increment Letter', emp, {
        effectiveDate: row.effective_date,
        newSalary: row.new_salary ? Number(String(row.new_salary).replace(/[^0-9.]/g, '')) : undefined,
      });
      const letterTitle = `Salary Increment Letter - ${emp.name}`;

      try {
        await apiClient.post('/api/employees', {
          action: 'hr_letter_save',
          employee_id: emp.id,
          template_type: 'Salary Increment Letter',
          title: letterTitle,
          content: contentText,
          status: 'final',
          changed_by: profile.id,
          changed_by_name: profile.name,
        });
        generated += 1;
      } catch (err) {
        skipped.push({ row: row.rowNumber, reason: err instanceof Error ? err.message : 'Save failed' });
      }
    }

    setImportResult({ generated, skipped });
    setMessage(`Generated ${generated} letter(s).${skipped.length ? ` Skipped ${skipped.length}.` : ''}`);
    await fetchAll();
    setImporting(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(prev => prev.size === letters.length ? new Set() : new Set(letters.map(l => l.id)));
  };

  const sendLetters = async (ids: number[]) => {
    if (!profile) return;
    if (!ids.length) { setMessage('Select at least one letter to send.'); return; }
    if (!window.confirm(`Send ${ids.length} letter(s) to employees by email?`)) return;
    setSending(true); setMessage('');
    try {
      const result = await apiClient.post<{ sent: number; failed: number }>('/api/employees', { action: 'hr_letter_send', ids, changed_by: profile.id, changed_by_name: profile.name });
      setMessage(`Sent ${result.sent} letter(s).${result.failed ? ` ${result.failed} failed.` : ''}`);
      setSelectedIds(new Set());
      await fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send letters.');
    } finally { setSending(false); }
  };

  const generate = () => {
    setTitle(`${templateType} - ${selectedEmployee?.name ?? ''}`.trim());
    setContent(buildTemplate(templateType, selectedEmployee));
  };

  const saveLetter = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !employeeId || !title || !content) { setMessage('Employee, title and content are required.'); return; }
    setSaving(true); setMessage('');
    try {
      await apiClient.post('/api/employees', { action: 'hr_letter_save', employee_id: Number(employeeId), template_type: templateType, title, content, status: 'final', changed_by: profile.id, changed_by_name: profile.name });
      setMessage('Letter saved successfully.'); await fetchAll();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Failed to save letter.'); }
    finally { setSaving(false); }
  };

  const printContent = (letter?: HrLetter) => {
    const printTitle = letter?.title || title;
    const printBody = letter?.content || content;
    printDocument({
      title: printTitle,
      docTitle: printTitle,
      subtitle: 'Human Resource Department · Official HR Letter',
      bodyHtml: `<div class="letter-body">${escapeHtml(printBody)}</div>`,
    });
  };

  const deleteLetter = async (letter: HrLetter) => {
    if (!profile || !window.confirm(`Delete letter "${letter.title}"?`)) return;
    try {
      await apiClient.post('/api/employees', { action: 'hr_letter_delete', id: letter.id, changed_by: profile.id, changed_by_name: profile.name });
      setSelectedIds(prev => { const n = new Set(prev); n.delete(letter.id); return n; });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete letter.');
    }
    await fetchAll();
  };

  if (!isAdminOrManager) return <ErrorState message="HR Letters are for Admin/Manager only." onRetry={() => undefined} />;
  if (loading) return <LoadingState label="Loading HR letters…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return <div>
    <PageHeader title="HR Letters Generator" subtitle="Generate, save, print and email common HR letters." action={<button onClick={fetchAll} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold"><RefreshCw size={16}/>Refresh</button>} />
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-6">
        {/* Single letter form */}
        <form onSubmit={saveLetter} className="glass rounded-2xl p-5 space-y-3">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <select value={templateType} onChange={(e) => setTemplateType(e.target.value)} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5">{TEMPLATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <button type="button" onClick={generate} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold">Generate Template</button>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Letter title" className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5" />
          <textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 resize-none" />
          {message && <p className={`text-sm ${message.includes('success') || message.includes('Generated') || message.includes('Sent') || message.includes('detected') ? 'text-emerald' : 'text-rose'}`}>{message}</p>}
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => printContent()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5"><Printer size={16}/>Print</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}Save</button></div>
        </form>

        {/* Salary Increment bulk import */}
        <div className="glass rounded-2xl p-5 space-y-3">
          <h3 className="font-display font-semibold">Bulk Generate — Salary Increment Letters</h3>
          <p className="text-xs text-muted">Upload .xlsx/.csv with columns: <code>employee_no</code> (or <code>email</code>), optional <code>new_salary</code>, <code>effective_date</code>. One row per employee.</p>
          <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold cursor-pointer hover:bg-white/10">
            {importing ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
            Choose File
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          </label>

          {parsedRows.length > 0 && (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="max-h-52 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead className="bg-white/5 sticky top-0"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Employee No / Email</th><th className="p-2 text-left">Matched</th><th className="p-2 text-left">New Salary</th><th className="p-2 text-left">Effective</th></tr></thead>
                  <tbody>
                    {parsedRows.map(r => {
                      const emp = findEmployeeForRow(r);
                      return <tr key={r.rowNumber} className="border-t border-white/5">
                        <td className="p-2">{r.rowNumber}</td>
                        <td className="p-2">{r.employee_no || r.email}</td>
                        <td className={`p-2 ${emp ? 'text-emerald' : 'text-rose'}`}>{emp ? emp.name : '✗ not found'}</td>
                        <td className="p-2">{r.new_salary || '—'}</td>
                        <td className="p-2">{r.effective_date || '—'}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button type="button" onClick={bulkGenerateAndSave} disabled={!parsedRows.length || importing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-white text-sm font-semibold disabled:opacity-50">
            {importing ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
            Generate & Save All ({parsedRows.length})
          </button>

          {importResult && (
            <div className="text-xs space-y-1">
              {importResult.skipped.length > 0 && (
                <div className="text-rose">Skipped rows: {importResult.skipped.map(s => `#${s.row} (${s.reason})`).join(', ')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Saved letters */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Saved Letters ({letters.length})</h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
              <input type="checkbox" checked={letters.length > 0 && selectedIds.size === letters.length} onChange={selectAll} />
              Select all
            </label>
            <button onClick={() => sendLetters([...selectedIds])} disabled={sending || selectedIds.size === 0} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {sending ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
              Send Selected ({selectedIds.size})
            </button>
          </div>
        </div>
        {letters.length===0?<EmptyState label="No letters generated yet."/>:<div className="space-y-2 max-h-[760px] overflow-y-auto">{letters.map(l=><div key={l.id} className={`rounded-xl border p-4 ${selectedIds.has(l.id) ? 'border-primary/50 bg-primary/5' : 'border-white/10 bg-surface'}`}>
          <div className="flex justify-between gap-3">
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} className="mt-1" />
              <div><p className="font-semibold">{l.title}</p><p className="text-xs text-muted">{employees.find(e=>e.id===l.employee_id)?.name ?? `#${l.employee_id}`} · {formatDate(l.created_at)}</p></div>
            </div>
            <Badge tone={l.status === 'sent' ? 'success' : 'info'}>{l.status === 'sent' ? 'Sent' : l.template_type.split(' ')[0]}</Badge>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={()=>sendLetters([l.id])} disabled={sending} title="Email this letter" className="rounded-lg border border-white/10 bg-white/5 p-2 disabled:opacity-50"><Send size={14}/></button>
            <button onClick={()=>printContent(l)} className="rounded-lg border border-white/10 bg-white/5 p-2"><Printer size={14}/></button>
            <button onClick={()=>deleteLetter(l)} className="rounded-lg border border-rose/20 bg-rose/10 p-2 text-rose"><Trash2 size={14}/></button>
          </div>
        </div>)}</div>}
      </div>
    </div>
  </div>;
}
