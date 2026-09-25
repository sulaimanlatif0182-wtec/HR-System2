import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, ChevronDown } from 'lucide-react';
import { PageHeader, LoadingState, ErrorState } from '../components/Shared';
import type { Employee } from '../types';
import apiClient from '../lib/api';

const COLORS: Record<string, string> = {};
const PALETTE = ['#8b5cf6', '#22d3ee', '#fbbf24', '#fb7185', '#34d399', '#6366f1', '#f472b6'];

function colorFor(dept: string) {
  if (!COLORS[dept]) {
    COLORS[dept] = PALETTE[Object.keys(COLORS).length % PALETTE.length];
  }
  return COLORS[dept];
}

function initialsOf(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function displayRole(role: string | null | undefined) {
  if (role === 'employee') return 'staff';
  return role ?? '—';
}

function rankOf(role: string) {
  return role === 'admin' ? 0 : role === 'manager' ? 1 : 2;
}

interface ForestNode {
  employee: Employee;
  children: ForestNode[];
}

function sortForest(nodes: ForestNode[]): ForestNode[] {
  nodes.sort(
    (a, b) =>
      rankOf(a.employee.role) - rankOf(b.employee.role) ||
      a.employee.name.localeCompare(b.employee.name)
  );
  nodes.forEach((node) => sortForest(node.children));
  return nodes;
}

function buildForest(employees: Employee[]): ForestNode[] {
  const byId = new Map<number, ForestNode>();
  employees.forEach((e) => byId.set(e.id, { employee: e, children: [] }));

  const roots: ForestNode[] = [];
  employees.forEach((e) => {
    const node = byId.get(e.id);
    if (!node) return;
    const sup = e.supervisor_id;
    const parent = sup != null && sup !== e.id ? byId.get(sup) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Supervisor cycles (A reports to B reports to A) are detached from every
  // root and would otherwise vanish — surface leftovers as roots. The render
  // guard below stops infinite recursion through them.
  const seen = new Set<number>();
  const walk = (node: ForestNode) => {
    if (seen.has(node.employee.id)) return;
    seen.add(node.employee.id);
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  byId.forEach((node) => {
    if (!seen.has(node.employee.id)) {
      roots.push(node);
      seen.add(node.employee.id);
    }
  });

  return sortForest(roots);
}

function TreeNode({ node, ancestors }: { node: ForestNode; ancestors: number[] }) {
  const { employee } = node;
  const [open, setOpen] = useState(true);
  const dept = employee.department || 'Unassigned';
  const kids = node.children.filter((c) => !ancestors.includes(c.employee.id));
  const next = [...ancestors, employee.id];

  return (
    <div>
      <div className="flex items-center gap-3 rounded-xl bg-surface border border-white/10 px-3 py-2.5 hover:bg-white/[0.04] transition-all">
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-6 h-6 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-white/10 transition-all shrink-0"
            title={open ? 'Collapse team' : 'Expand team'}
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${open ? '' : '-rotate-90'}`}
            />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        <div
          className="w-9 h-9 rounded-lg grid place-items-center text-xs font-bold shrink-0"
          style={{ background: `${colorFor(dept)}30`, color: colorFor(dept) }}
        >
          {initialsOf(employee.name)}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{employee.name}</p>
          <p className="text-[11px] text-muted truncate">
            {employee.title}
            {dept !== 'Unassigned' ? ` · ${dept}` : ''}
          </p>
        </div>

        {employee.role !== 'employee' && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-primary font-semibold shrink-0">
            {displayRole(employee.role)}
          </span>
        )}

        {kids.length > 0 && (
          <span className="ml-auto text-[11px] text-muted flex items-center gap-1 shrink-0">
            <Users size={11} />
            {kids.length}
          </span>
        )}
      </div>

      {open && kids.length > 0 && (
        <div className="ml-5 mt-2 space-y-2 border-l border-white/10 pl-4">
          {kids.map((child) => (
            <TreeNode key={child.employee.id} node={child} ancestors={next} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    try {
      const e = await apiClient.get('/api/employees');
      setEmployees(Array.isArray(e) ? e : []);
    } catch {
      setError('Failed to load org chart.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await fetchAll();
    })();
  }, []);

  const forest = useMemo(() => buildForest(employees), [employees]);

  if (loading) return <LoadingState label="Building organization tree…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Organization Chart"
        subtitle={`Reporting hierarchy by Working with across ${employees.length} people.`}
      />

      {forest.length === 0 ? (
        <p className="text-sm text-muted">No employees to display.</p>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto space-y-2"
        >
          {forest.map((node) => (
            <TreeNode key={node.employee.id} node={node} ancestors={[]} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
