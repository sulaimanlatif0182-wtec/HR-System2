import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BarChart3, Save, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui';

interface Employee { id: number; name: string; department?: string | null; }
interface Review { id: number; employee_id: number; review_period: string; review_type: string; reviewer_name?: string | null; kpi_score: number; behavior_score: number; attendance_score: number; overall_score: number; strengths?: string | null; improvements?: string | null; goals?: string | null; recommendation?: string | null; status: string; created_at: string; }

const EMPTY = { id: null as number | null, employee_id: '', review_period: new Date().getFullYear().toString(), review_type: 'Annual Review', kpi_score: '0', behavior_score: '0', attendance_score: '0', strengths: '', improvements: '', goals: '', recommendation: '', status: 'draft' };
function scoreTone(score: number) { if (score >= 85) return 'success'; if (score >= 70) return 'info'; if (score >= 50) return 'warning'; return 'danger'; }

export default function Performance() {
  const { profile } = useAuth();
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchAll = async () => {
    setLoading(true); setError('');
    try {
      const [emp, rv] = await Promise.all([
        fetch('/api/employees').then(r => r.json()),
        fetch(profile?.role === 'employee' ? `/api/employees?performance_reviews=true&employee_id=${profile?.id}` : '/api/employees?performance_reviews=true').then(r => r.json()),
      ]);
      setEmployees(Array.isArray(emp) ? emp : []);
      setReviews(Array.isArray(rv) ? rv : []);
    } catch { setError('Failed to load performance reviews.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, [profile?.id]);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);
  const overall = Math.round(((Number(form.kpi_score)||0)+(Number(form.behavior_score)||0)+(Number(form.attendance_score)||0))/3);

  const saveReview = async (e: FormEvent) => {
    e.preventDefault(); if (!profile || !form.employee_id) return;
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/employees', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'performance_save', ...form, employee_id:Number(form.employee_id), overall_score: overall, reviewer_id: profile.id, reviewer_name: profile.name, changed_by: profile.id, changed_by_name: profile.name }) });
      const data = await res.json().catch(()=>null); if(!res.ok) throw new Error(data?.error || 'Failed to save review.');
      setForm(EMPTY); setMessage('Performance review saved successfully.'); await fetchAll();
    } catch(err) { setMessage(err instanceof Error ? err.message : 'Failed to save review.'); }
    finally { setSaving(false); }
  };
  const editReview = (r: Review) => setForm({ id:r.id, employee_id:String(r.employee_id), review_period:r.review_period, review_type:r.review_type, kpi_score:String(r.kpi_score), behavior_score:String(r.behavior_score), attendance_score:String(r.attendance_score), strengths:r.strengths??'', improvements:r.improvements??'', goals:r.goals??'', recommendation:r.recommendation??'', status:r.status });
  const deleteReview = async (r: Review) => { if(!profile || !confirm('Delete performance review?')) return; const res=await fetch('/api/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'performance_delete',id:r.id,changed_by:profile.id,changed_by_name:profile.name})}); if(!res.ok) alert('Failed to delete.'); await fetchAll(); };

  if (loading) return <LoadingState label="Loading performance reviews…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return <div><PageHeader title="Performance / Appraisal" subtitle="Track KPI scores, manager review, goals and appraisal recommendations." action={<button onClick={fetchAll} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold"><RefreshCw size={16}/>Refresh</button>} />
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {isAdminOrManager && <form onSubmit={saveReview} className="glass rounded-2xl p-5 space-y-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center"><BarChart3 size={20}/></div><div><h3 className="font-display font-semibold">Review Form</h3><p className="text-xs text-muted">Overall score is average of KPI, behavior and attendance.</p></div></div>{message&&<p className={`text-sm ${message.includes('success')?'text-emerald':'text-rose'}`}>{message}</p>}<select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"><option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><div className="grid grid-cols-2 gap-3"><input value={form.review_period} onChange={e=>setForm({...form,review_period:e.target.value})} placeholder="Review period" className="bg-surface border border-white/10 rounded-xl px-3 py-2.5"/><select value={form.review_type} onChange={e=>setForm({...form,review_type:e.target.value})} className="bg-surface border border-white/10 rounded-xl px-3 py-2.5"><option>Annual Review</option><option>Probation Review</option><option>Promotion Review</option><option>Performance Improvement</option></select></div><div className="grid grid-cols-4 gap-3">{[['kpi_score','KPI'],['behavior_score','Behavior'],['attendance_score','Attendance']].map(([k,l])=><label key={k} className="text-xs text-muted">{l}<input type="number" min="0" max="100" value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="mt-1 w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"/></label>)}<div className="rounded-xl bg-primary/10 border border-primary/20 p-3"><p className="text-xs text-muted">Overall</p><p className="font-bold text-xl">{overall}</p></div></div>{['strengths','improvements','goals','recommendation'].map(k=><textarea key={k} rows={2} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={k.replace('_',' ')} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 resize-none"/>)}<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5"><option value="draft">Draft</option><option value="completed">Completed</option><option value="acknowledged">Acknowledged</option></select><div className="flex justify-end gap-2">{form.id&&<button type="button" onClick={()=>setForm(EMPTY)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">Cancel</button>}<button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-white disabled:opacity-50">{saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>}Save</button></div></form>}
      <div className="glass rounded-2xl p-5"><h3 className="font-display font-semibold mb-4">Reviews</h3>{reviews.length===0?<EmptyState label="No performance reviews yet."/>:<div className="space-y-3 max-h-[760px] overflow-y-auto">{reviews.map(r=><div key={r.id} className="rounded-xl border border-white/10 bg-surface p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{employeeMap[r.employee_id]?.name ?? `#${r.employee_id}`}</p><p className="text-xs text-muted">{r.review_type} · {r.review_period} · Reviewer: {r.reviewer_name || '—'}</p></div><Badge tone={scoreTone(Number(r.overall_score))}>{r.overall_score}</Badge></div><p className="text-xs text-muted mt-2">Strengths: {r.strengths || '—'}</p><p className="text-xs text-muted mt-1">Improvements: {r.improvements || '—'}</p>{isAdminOrManager&&<div className="flex gap-2 mt-3"><button onClick={()=>editReview(r)} className="rounded-lg border border-white/10 bg-white/5 p-2">Edit</button><button onClick={()=>deleteReview(r)} className="rounded-lg border border-rose/20 bg-rose/10 p-2 text-rose"><Trash2 size={14}/></button></div>}</div>)}</div>}</div>
    </div>
  </div>;
}