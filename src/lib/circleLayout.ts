// Pure circle-layout math for the org chart (no JSX, no imports).
// Used by src/pages/OrgChart.tsx and verified by scripts/circle-layout-check.mjs,
// which compiles this file with the repo's own tsc and runs fixture graphs.
export interface CircleMemberInput {
  id: number;
  supervisor_id?: number | null;
}

export interface Xy {
  x: number;
  y: number;
}

// Visual-only position swaps (reporting lines unchanged), loaded from the
// seat-swaps API and passed in per call. Keyed by circle manager id; each
// pair exchanges the final computed coordinates of two members. Guards make
// unknown/missing ids a no-op.
export type SeatSwapMap = Record<number, Array<readonly [number, number]>>;

/**
 * Toggle a seat-swap pair in a circle's draft list: picking the same two
 * members again removes the pair (swap back to normal). Picking a new partner
 * for an already-swapped member moves them — the conflicting old pair is
 * dropped so the draft can never hold overlapping pairs (the server rejects
 * those with 400, which surfaces as an unhelpful alert on Save).
 * Order-insensitive; never mutates the input list.
 */
export function toggleSwapPair(
  list: Array<readonly [number, number]>,
  a: number,
  b: number,
): Array<readonly [number, number]> {
  const idx = list.findIndex(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
  if (idx >= 0) {
    const next = [...list];
    next.splice(idx, 1);
    return next;
  }
  return [...list.filter(([x, y]) => x !== a && x !== b && y !== a && y !== b), [a, b]];
}

function applyVisualSwaps(
  mgrId: number | null | undefined,
  pos: Map<number, Xy>,
  swaps?: SeatSwapMap,
): void {
  if (mgrId == null) return;
  const list = swaps?.[mgrId];
  if (!list) return;
  for (const [a, b] of list) {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (!pa || !pb) continue;
    pos.set(a, pb);
    pos.set(b, pa);
  }
}

export function computeCirclePositions(
  members: CircleMemberInput[],
  mgrId: number | null | undefined,
  swaps?: SeatSwapMap,
): Map<number, Xy> {
  const n = members.length;
  const RING_R = n <= 2 ? 34 : n <= 4 ? 35 : 37;
  const big = n > 8;
  const NEED = big ? 17.7 : 20.5;
  const FLANK = big
    ? [18.7, -18.7, 23.7, -23.7, 28.7, -28.7]
    : [24, -24, 21.5, -21.5, 26, -26, 31, -31];
  const RADIAL = big ? [14, -14, 20, -20] : [16, -16, 22, -22];
  // Manager oval is 30% wide (half 15) x aspect 4/3 (half-height 11.25);
  // axes below add the 96px big-circle bubble radius (8.6% of 560).
  const OVAL_RX = 23.6;
  const OVAL_RY = 19.9;

  const point = (i: number, total: number): Xy => {
    const angle = -Math.PI / 2 + (i * (Math.PI * 2)) / Math.max(1, total);
    return {
      x: 50 + RING_R * Math.cos(angle),
      y: 50 + RING_R * Math.sin(angle),
    };
  };

  const directs =
    mgrId != null
      ? members.filter((m) => m.supervisor_id === mgrId)
      : members.slice();
  const directIds = new Set(directs.map((m) => m.id));
  const indirects = members.filter((m) => !directIds.has(m.id));
  const nd = directs.length;

  const pos = new Map<number, Xy>();
  if (mgrId != null) pos.set(mgrId, { x: 50, y: 50 });

  // Big circles whose full membership fits on the ring spread EVERY member
  // evenly (each direct followed by its whole team pre-order), so the full
  // 360° is used with no empty sectors. Small circles keep the legacy
  // directs-then-flanked-indirects layout below.
  const evenChord = 2 * RING_R * Math.sin(Math.PI / Math.max(1, n));
  if (big && evenChord >= NEED) {
    const kids = new Map<number, CircleMemberInput[]>();
    for (const m of members) {
      const pid = m.supervisor_id;
      if (pid != null && pid !== mgrId) {
        const arr = kids.get(pid);
        if (arr) arr.push(m);
        else kids.set(pid, [m]);
      }
    }
    const order: CircleMemberInput[] = [];
    const seen = new Set<number>();
    const visit = (m: CircleMemberInput): void => {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      order.push(m);
      for (const k of kids.get(m.id) ?? []) visit(k);
    };
    for (const d of directs) visit(d);
    for (const m of members) visit(m); // orphan/cycle safety net
    order.forEach((m, i) => pos.set(m.id, point(i, n)));
    applyVisualSwaps(mgrId, pos, swaps);
    return pos;
  }

  directs.forEach((m, i) => pos.set(m.id, point(i, nd)));

  const placed = [...pos.values()];
  const clearDist = (x: number, y: number) =>
    Math.min(...placed.map((q) => Math.hypot(q.x - x, q.y - y)));
  indirects.forEach((m) => {
    const pid = m.supervisor_id;
    const s = pid != null ? pos.get(pid) : undefined;
    const cl = (v: number) => Math.min(88, Math.max(12, v));
    const cands: Xy[] = [];
    if (s) {
      const dx = s.x - 50;
      const dy = s.y - 50;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const ux = dx / len;
      const uy = dy / len;
      for (const k of FLANK) {
        cands.push({ x: cl(s.x + px * k), y: cl(s.y + py * k) });
      }
      for (const k of RADIAL) {
        cands.push({ x: cl(s.x + ux * k), y: cl(s.y + uy * k) });
      }
    }
    for (let j = 0; j < n; j++) {
      const p = point(j, n);
      cands.push({ x: cl(p.x), y: cl(p.y) });
    }
    if (big) {
      for (const r of [26, 30, 34, 42, 48]) {
        for (let a = 0; a < 24; a++) {
          const t = (a * Math.PI) / 12;
          cands.push({ x: cl(50 + r * Math.cos(t)), y: cl(50 + r * Math.sin(t)) });
        }
      }
      cands.push({ x: 12, y: 12 }, { x: 88, y: 12 }, { x: 12, y: 88 }, { x: 88, y: 88 });
    }
    let best = cands[0];
    let bestScore = -1;
    for (const c of cands) {
      const d = clearDist(c.x, c.y);
      // Small circles keep the legacy predicate exactly (no oval term) so
      // their layout is unchanged; the oval guarantee applies to big circles.
      const ovalClear =
        !big || ((c.x - 50) / OVAL_RX) ** 2 + ((c.y - 50) / OVAL_RY) ** 2 >= 1
          ? 1
          : 0;
      const sc = big ? ovalClear * 1000 + d : d;
      if (ovalClear === 1 && d >= NEED) {
        best = c;
        bestScore = sc;
        break;
      }
      if (sc > bestScore) {
        best = c;
        bestScore = sc;
      }
    }
    const settled = best ?? { x: 50, y: 50 };
    pos.set(m.id, settled);
    placed.push(settled);
  });
  applyVisualSwaps(mgrId, pos, swaps);
  return pos;
}
