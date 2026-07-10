import { useEffect, useMemo, useState,  } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Grid3x3, List, Mail, Phone, MapPin, X, Plus, Loader2, Briefcase, CalendarDays, DollarSign } from 'lucide-react';
import { PageHeader, LoadingState, ErrorState, EmptyState, Badge } from '../components/Shared';
import TiltCard from '../components/TiltCard';
import type { Employee } from '../types';
import { useSearchParams } from 'react-router-dom';

const statusTone: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  on_leave: 'warning',
  inactive: 'default',
};

function initialsOf(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  // Keep local search in sync when arriving via global header search
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearch(q);
  }, [searchParams]);
  const [deptFilter, setDeptFilter] = useState('all');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', title: '', department: '', phone: '', location: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [tab, setTab] = useState<'info' | 'documents' | 'performance'>('info');

  const fetchEmployees = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load employees.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, []);

  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department).filter(Boolean));
    return ['all', ...Array.from(set) as string[]];
  }, [employees]);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const s = search.toLowerCase();
      const matchesSearch =
        e.name.toLowerCase().includes(s) ||
        e.email.toLowerCase().includes(s) ||
        (e.title ?? '').toLowerCase().includes(s) ||
        (e.department ?? '').toLowerCase().includes(s) ||
        (e.location ?? '').toLowerCase().includes(s);
      const matchesDept = deptFilter === 'all' || e.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, search, deptFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      setFormError('Name and email are required.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, role: 'employee', status: 'active', join_date: new Date().toISOString().slice(0, 10) }),
      });
      if (!res.ok) throw new Error('Failed to add employee');
      setShowForm(false);
      setFormData({ name: '', email: '', title: '', department: '', phone: '', location: '' });
      fetchEmployees();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading employee directory…" />;
  if (error) return <ErrorState message={error} onRetry={fetchEmployees} />;

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        subtitle={`${employees.length} people across ${departments.length - 1} departments`}
        action={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] transition-all"
          >
            <Plus size={16} /> Add Employee
          </button>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or title…"
            className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-all"
        >
          {departments.map((d) => (
            <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>
          ))}
        </select>
        <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1">
          <button onClick={() => setView('grid')} className={`p-2 rounded-lg transition-all ${view === 'grid' ? 'bg-primary/20 text-primary' : 'text-muted'}`}>
            <Grid3x3 size={16} />
          </button>
          <button onClick={() => setView('table')} className={`p-2 rounded-lg transition-all ${view === 'table' ? 'bg-primary/20 text-primary' : 'text-muted'}`}>
            <List size={16} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label="No employees match your filters." />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((emp, i) => (
            <motion.div
              key={emp.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.4) }}
            >
              <TiltCard className="p-5 cursor-pointer h-full" intensity={6}>
                <div onClick={() => { setSelected(emp); setTab('info'); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center font-bold shrink-0">
                      {initialsOf(emp.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{emp.name}</p>
                      <p className="text-xs text-muted truncate">{emp.title}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <Badge tone="info">{emp.department}</Badge>
                    <Badge tone={statusTone[emp.status] ?? 'default'}>{emp.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                <th className="px-5 py-3.5 font-medium">Employee</th>
                <th className="px-5 py-3.5 font-medium">Department</th>
                <th className="px-5 py-3.5 font-medium">Title</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => { setSelected(emp); setTab('info'); }}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer transition-all"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-xs font-bold shrink-0">
                        {initialsOf(emp.name)}
                      </div>
                      <div>
                        <p className="font-medium">{emp.name}</p>
                        <p className="text-xs text-muted">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted">{emp.department}</td>
                  <td className="px-5 py-3.5 text-muted">{emp.title}</td>
                  <td className="px-5 py-3.5"><Badge tone={statusTone[emp.status] ?? 'default'}>{emp.status.replace('_', ' ')}</Badge></td>
                  <td className="px-5 py-3.5 text-muted">{emp.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Profile Drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-screen w-full max-w-md glass-solid border-l border-white/10 z-50 overflow-y-auto scrollbar-thin"
            >
              <div className="p-6">
                <button onClick={() => setSelected(null)} className="ml-auto flex text-muted hover:text-ink mb-4">
                  <X size={20} />
                </button>
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center text-2xl font-bold shadow-xl shadow-primary/30">
                    {initialsOf(selected.name)}
                  </div>
                  <h2 className="font-display text-xl font-bold mt-4">{selected.name}</h2>
                  <p className="text-muted text-sm">{selected.title}</p>
                  <div className="flex gap-2 mt-3">
                    <Badge tone="info">{selected.department}</Badge>
                    <Badge tone={statusTone[selected.status] ?? 'default'}>{selected.status.replace('_', ' ')}</Badge>
                  </div>
                </div>

                <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1 mt-6">
                  {(['info', 'documents', 'performance'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${tab === t ? 'bg-primary/20 text-primary' : 'text-muted hover:text-ink'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {tab === 'info' && (
                    <>
                      <InfoRow icon={Mail} label="Email" value={selected.email} />
                      <InfoRow icon={Phone} label="Phone" value={selected.phone ?? '—'} />
                      <InfoRow icon={MapPin} label="Location" value={selected.location ?? '—'} />
                      <InfoRow icon={CalendarDays} label="Joined" value={selected.join_date ?? '—'} />
                      <InfoRow icon={Briefcase} label="Role" value={selected.role} />
                      {selected.salary && <InfoRow icon={DollarSign} label="Annual Salary" value={`$${Number(selected.salary).toLocaleString()}`} />}
                    </>
                  )}
                  {tab === 'documents' && (
                    <div className="space-y-2">
                      {['Employment Contract.pdf', 'ID Verification.pdf', 'Tax Form W-4.pdf'].map((doc) => (
                        <div key={doc} className="flex items-center justify-between glass rounded-xl px-4 py-3 text-sm">
                          <span>{doc}</span>
                          <span className="text-xs text-muted">2.1 MB</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {tab === 'performance' && (
                    <div className="space-y-3">
                      {[['Q1 Review', 92], ['Q2 Review', 88], ['Q3 Review', 95]].map(([label, score]) => (
                        <div key={label as string} className="glass rounded-xl px-4 py-3">
                          <div className="flex justify-between text-sm mb-2">
                            <span>{label}</span>
                            <span className="text-primary font-semibold">{score}%</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8 }}
                              className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Employee Modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-solid rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">Add Employee</h3>
                  <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input required placeholder="Full name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                  <input required type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                  <input placeholder="Job title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                  <input placeholder="Department" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                    <input placeholder="Location" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50" />
                  </div>
                  {formError && <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">{formError}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold mt-2 disabled:opacity-60"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Add Employee'}
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

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 glass rounded-xl px-4 py-3">
      <Icon size={16} className="text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted">{label}</p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
}
