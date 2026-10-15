import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { PageHeader, LoadingState, ErrorState } from '../components/Shared';
import type { Employee } from '../types';
import apiClient from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { computeCirclePositions, toggleSwapPair, type SeatSwapMap } from '../lib/circleLayout';

interface SeatSwapRow {
  manager_id: number;
  member_a_id: number;
  member_b_id: number;
}

interface SelectedSeat {
  mgrId: number;
  id: number;
}

const COLORS: Record<string, string> = {};
const PALETTE = ['#17479D', '#D71921', '#2E6BC4', '#0EA5E9', '#16A34A', '#D97706', '#7BA7E0'];

function colorFor(dept: string) {
  if (!COLORS[dept]) {
    COLORS[dept] = PALETTE[Object.keys(COLORS).length % PALETTE.length];
  }
  return COLORS[dept];
}

function rankOf(role: string) {
  return role === 'admin' ? 0 : role === 'manager' ? 1 : 2;
}

const MANAGER_TITLES: Record<string, string> = {
  'Chieu Pi Yoon': 'HR & Admin',
  'Henry Hoo': 'Sales & Marketing',
  'Kua Kok Foo': 'Planner Cum Material Control',
  'Goh Shuw Hur': 'Finance',
  'Wong Mok Hui': 'Production',
  'Muhammad Akimuddin Bin Che Lah': 'Engineer',
};

function managerTitle(person: Employee): string {
  return MANAGER_TITLES[person.name] ?? person.title ?? person.department ?? '';
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

interface CircleGroup {
  manager: Employee | null;
  label: string;
  members: Employee[];
}

function collectCircles(forest: ForestNode[]): CircleGroup[] {
  const groups: CircleGroup[] = [];
  const seen = new Set<number>();
  const walk = (nodes: ForestNode[], depth: number) => {
    nodes.forEach((n) => {
      if (seen.has(n.employee.id)) return;
      seen.add(n.employee.id);
      if (depth === 0 && n.children.length > 0) {
        const dept = n.employee.department || 'Unassigned';
        const members: Employee[] = [];
        const gather = (m: ForestNode) => {
          m.children.forEach((c) => {
            if (seen.has(c.employee.id)) return;
            seen.add(c.employee.id);
            members.push(c.employee);
            gather(c);
          });
        };
        gather(n);
        groups.push({
          manager: n.employee,
          label: dept !== 'Unassigned' ? dept : 'Team',
          members,
        });
      }
      walk(n.children, depth + 1);
    });
  };
  walk(forest, 0);

  const covered = new Set<number>();
  groups.forEach((g) => {
    if (g.manager) covered.add(g.manager.id);
    g.members.forEach((m) => covered.add(m.id));
  });

  const singles = forest
    .filter((r) => r.children.length === 0 && !covered.has(r.employee.id))
    .map((r) => r.employee);
  if (singles.length > 0) {
    groups.push({ manager: null, label: 'Individual', members: singles });
  }
  return groups;
}

function ManagerOval({ person }: { person: Employee }) {
  const dept = person.department || 'Unassigned';
  const color = colorFor(dept);
  return (
    <div
      className="w-[30%] min-w-[84px] sm:min-w-[132px] aspect-[4/3] rounded-[50%] bg-surface border-2 flex flex-col items-center justify-center text-center px-7 shadow-sm"
      style={{ borderColor: color }}
      title={`${person.name} — ${managerTitle(person)}`}
    >
      <p className="text-sm font-bold break-words leading-tight">{person.name}</p>
      <p className="text-[11px] text-muted break-words leading-tight mt-1">
        {managerTitle(person)}
      </p>
    </div>
  );
}

function StaffBubble({ person, small, highlight }: { person: Employee; small?: boolean; highlight?: boolean }) {
  const dept = person.department || 'Unassigned';
  const color = colorFor(dept);
  return (
    <div
      className={`w-24 h-24 rounded-full border-2 bg-surface shadow-sm flex flex-col items-center justify-center text-center px-2 ${small ? '' : 'sm:w-28 sm:h-28'} ${highlight ? 'ring-4 ring-primary scale-105' : ''}`}
      style={{ borderColor: color }}
      title={`${person.name} — ${person.title ?? person.department ?? ''}`}
    >
      <p className="text-[10px] font-bold break-words leading-tight" style={{ color }}>
        {person.name}
      </p>
      <p className="text-[8px] text-muted break-words leading-tight mt-0.5">
        {person.title || dept}
      </p>
    </div>
  );
}

function ManagerCircle({
  group,
  reportsTo,
  swaps,
  editing,
  selectedId,
  onPick,
}: {
  group: CircleGroup;
  reportsTo?: string;
  swaps: SeatSwapMap;
  editing: boolean;
  selectedId: number | null;
  onPick: (mgrId: number, id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const n = group.members.length;
  const big = n > 8;
  const mgrId = group.manager?.id;
  const pos = computeCirclePositions(group.members, mgrId, swaps);

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const bow = len * 0.14;
    const cx = mx + (-dy / len) * bow;
    const cy = my + (dx / len) * bow;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };

  const links: { id: number; d: string; direct: boolean }[] = [];
  group.members.forEach((m) => {
    const to = pos.get(m.id);
    if (!to) return;
    const pid = m.supervisor_id;
    const direct = mgrId != null && pid === mgrId;
    const from = direct
      ? { x: 50, y: 50 }
      : pid != null
        ? pos.get(pid)
        : undefined;
    if (!from) return;
    links.push({ id: m.id, d: curve(from.x, from.y, to.x, to.y), direct });
  });

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 flex gap-3">
      <div className="flex flex-col items-center justify-center rounded-xl bg-primary-soft/60 px-1.5 py-3 shrink-0">
        <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-bold tracking-wide text-primary whitespace-nowrap">
          {group.manager ? managerTitle(group.manager) : group.label}
        </span>
      </div>
      <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold">
          {group.manager ? group.manager.name : group.label}
        </span>
        <span className="text-[11px] text-muted">
          {n} {n === 1 ? 'member' : 'members'}
        </span>
        {reportsTo && (
          <span className="text-[11px] text-muted">↑ Reports to {reportsTo}</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto w-6 h-6 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-primary-soft transition-all"
          title={collapsed ? 'Expand circle' : 'Collapse circle'}
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
      </div>

      {!collapsed && (
        <div className="relative mx-auto aspect-square w-full select-none max-w-[560px]">
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 h-full w-full"
          >
            {links.map((l) => (
              <path
                key={`link-${l.id}`}
                d={l.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={l.direct ? 1.2 : 2}
                vectorEffect="non-scaling-stroke"
                className={l.direct ? 'text-border' : 'text-muted'}
              />
            ))}
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            {group.manager ? (
              <ManagerOval person={group.manager} />
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted">
                {group.label}
              </div>
            )}
          </div>

          {group.members.map((m) => {
            const p = pos.get(m.id) ?? { x: 50, y: 50 };
            const interactive = editing && mgrId != null;
            return (
              <div
                key={m.id}
                className={`absolute ${interactive ? 'cursor-pointer touch-manipulation' : ''}`}
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={interactive ? () => onPick(mgrId, m.id) : undefined}
              >
                <StaffBubble person={m} small={big} highlight={selectedId === m.id} />
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

function ManagerCircles({
  forest,
  swaps,
  editing,
  selected,
  onPick,
}: {
  forest: ForestNode[];
  swaps: SeatSwapMap;
  editing: boolean;
  selected: SelectedSeat | null;
  onPick: (mgrId: number, id: number) => void;
}) {
  const groups = useMemo(() => collectCircles(forest), [forest]);
  const names = useMemo(() => {
    const map = new Map<number, string>();
    const walk = (nodes: ForestNode[]) => {
      nodes.forEach((n) => {
        if (!map.has(n.employee.id)) {
          map.set(n.employee.id, n.employee.name);
          walk(n.children);
        }
      });
    };
    walk(forest);
    return map;
  }, [forest]);

  if (groups.length === 0) {
    return <p className="text-sm text-muted">No employees to display.</p>;
  }

  return (
    <div className="grid gap-5 max-w-3xl mx-auto">
      {groups.map((g, i) => (
        <ManagerCircle
          key={g.manager ? `mgr-${g.manager.id}` : `group-${i}`}
          group={g}
          reportsTo={
            g.manager?.supervisor_id != null
              ? names.get(g.manager.supervisor_id)
              : undefined
          }
          swaps={swaps}
          editing={editing}
          selectedId={selected && g.manager?.id === selected.mgrId ? selected.id : null}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

export default function OrgChart() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<SelectedSeat | null>(null);
  const [savedSwaps, setSavedSwaps] = useState<SeatSwapMap>({});
  const [draftSwaps, setDraftSwaps] = useState<SeatSwapMap>({});
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [e, s] = await Promise.all([
        apiClient.get('/api/employees'),
        apiClient.get('/api/org-chart/seat-swaps'),
      ]);
      setEmployees(Array.isArray(e) ? e : []);
      const map: SeatSwapMap = {};
      if (Array.isArray(s)) {
        for (const r of s as SeatSwapRow[]) {
          if (
            typeof r?.manager_id !== 'number' ||
            typeof r?.member_a_id !== 'number' ||
            typeof r?.member_b_id !== 'number'
          ) {
            continue;
          }
          (map[r.manager_id] ??= []).push([r.member_a_id, r.member_b_id]);
        }
      }
      setSavedSwaps(map);
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

  const dirty = useMemo(() => {
    const keys = new Set([
      ...Object.keys(savedSwaps),
      ...Object.keys(draftSwaps),
    ]);
    for (const k of keys) {
      if (
        JSON.stringify(savedSwaps[Number(k)] ?? []) !==
        JSON.stringify(draftSwaps[Number(k)] ?? [])
      ) {
        return true;
      }
    }
    return false;
  }, [savedSwaps, draftSwaps]);

  const startEdit = () => {
    setDraftSwaps({ ...savedSwaps });
    setSelected(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraftSwaps(savedSwaps);
    setSelected(null);
    setEditing(false);
  };

  const handlePick = (mgrId: number, id: number) => {
    if (!editing) return;
    if (!selected || selected.mgrId !== mgrId) {
      setSelected({ mgrId, id });
      return;
    }
    if (selected.id === id) {
      setSelected(null);
      return;
    }
    const a = selected.id;
    const b = id;
    setDraftSwaps((d) => ({
      ...d,
      [mgrId]: toggleSwapPair(d[mgrId] ?? [], a, b),
    }));
    setSelected(null);
  };

  const handleSave = async () => {
    const mids: number[] = [];
    const keys = new Set([
      ...Object.keys(savedSwaps),
      ...Object.keys(draftSwaps),
    ]);
    for (const k of keys) {
      if (
        JSON.stringify(savedSwaps[Number(k)] ?? []) !==
        JSON.stringify(draftSwaps[Number(k)] ?? [])
      ) {
        mids.push(Number(k));
      }
    }
    setSaving(true);
    try {
      await Promise.all(
        mids.map((mid) =>
          apiClient.put('/api/org-chart/seat-swaps', {
            manager_id: mid,
            swaps: draftSwaps[mid] ?? [],
          })
        )
      );
      setSavedSwaps(draftSwaps);
      setSelected(null);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save layout.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Building organization tree…" />;
  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Organization Chart"
        subtitle={`Reporting hierarchy by Working with across ${employees.length} people.`}
        action={
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-primary-soft"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-primary-soft disabled:opacity-50"
                >
                  Save{dirty ? ' •' : ''}
                </button>
              </>
            ) : (
              <>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-primary-soft"
                  >
                    Edit layout
                  </button>
                )}
                <button
                  type="button"
                  onClick={fetchAll}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-primary-soft"
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </>
            )}
          </div>
        }
      />

      {forest.length === 0 ? (
        <p className="text-sm text-muted">No employees to display.</p>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          <ManagerCircles
            forest={forest}
            swaps={editing ? draftSwaps : savedSwaps}
            editing={editing}
            selected={selected}
            onPick={handlePick}
          />
        </motion.div>
      )}
    </div>
  );
}
