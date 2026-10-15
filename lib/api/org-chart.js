import { supabase } from '../db-client.js';
import { requireAuth } from '../requireAuth.js';
import { assertAdmin } from '../authorize.js';
import { setCors } from '../cors.js';
import { dbError } from '../errors.js';

// Canonical seat-swap pair ordering: smaller id first so (a, b) and (b, a)
// are the same row under the UNIQUE(manager_id, member_a_id, member_b_id)
// constraint enforced by CHECK (member_a_id < member_b_id).
export function canonPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

// Validate a PUT/POST swap payload before any DB touch.
// Returns { ok: true, pairs } with canonicalized + deduplicated pairs,
// or { ok: false, error, status }.
export function validateSwapPayload(manager_id, pairs) {
  if (!isPositiveInt(manager_id)) {
    return { ok: false, error: 'manager_id must be a positive integer.', status: 400 };
  }
  if (!Array.isArray(pairs)) {
    return { ok: false, error: 'swaps must be an array of [member_a, member_b] pairs.', status: 400 };
  }
  const seen = new Set();
  const usedMembers = new Set();
  const out = [];
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return { ok: false, error: 'Each swap must be a [member_a, member_b] pair.', status: 400 };
    }
    const [rawA, rawB] = pair;
    if (!isPositiveInt(rawA) || !isPositiveInt(rawB)) {
      return { ok: false, error: 'Swap member ids must be positive integers.', status: 400 };
    }
    if (rawA === rawB) {
      return { ok: false, error: 'A member cannot swap with itself.', status: 400 };
    }
    if (rawA === manager_id || rawB === manager_id) {
      return { ok: false, error: 'The circle manager cannot be a swap member.', status: 400 };
    }
    const [a, b] = canonPair(rawA, rawB);
    const key = `${a}:${b}`;
    if (seen.has(key)) continue; // exact duplicate pair in payload — harmless
    if (usedMembers.has(a) || usedMembers.has(b)) {
      return { ok: false, error: 'A member can only appear in one swap per circle.', status: 400 };
    }
    seen.add(key);
    usedMembers.add(a);
    usedMembers.add(b);
    out.push([a, b]);
  }
  return { ok: true, pairs: out };
}

const swapSelect = 'manager_id, member_a_id, member_b_id, created_at';

function toPairList(rows) {
  return (rows || []).map((r) => [r.member_a_id, r.member_b_id]);
}

async function safeInsertSeatSwapAudit({ action, manager_id, oldPairs, newPairs, actor }) {
  try {
    await supabase.from('system_audit_logs').insert({
      module: 'org_chart',
      action,
      record_id: manager_id,
      employee_id: actor.id,
      changed_by: actor.id,
      changed_by_name: actor.name,
      old_data: { manager_id, swaps: oldPairs },
      new_data: { manager_id, swaps: newPairs },
      reason: null,
    });
  } catch (err) {
    console.error('Seat-swap audit insert failed:', err?.message || err);
  }
}

// True when memberId sits anywhere in the manager's reporting subtree
// (direct or indirect). Walks supervisor links upward; cycle-safe.
// supervisorOf maps employee id -> supervisor_id (null/undefined at the top).
export function isInCircle(supervisorOf, manager_id, memberId) {
  const seen = new Set();
  let cur = memberId;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    const sup = supervisorOf.get(cur);
    if (sup === undefined) return false; // unknown id
    if (sup === manager_id) return true;
    cur = sup;
  }
  return false;
}

// Every member must exist and sit in the manager's subtree (direct or
// indirect — big circles render indirects on the ring too, so they are
// valid swap seats). One select of the whole reporting map; 404 when an id
// is unknown, 400 when outside this circle.
async function checkCircleMembers(manager_id, memberIds) {
  const { data, error } = await supabase
    .from('employees')
    .select('id, supervisor_id');
  if (error) throw error;
  const supervisorOf = new Map((data || []).map((e) => [e.id, e.supervisor_id]));
  for (const id of memberIds) {
    if (!supervisorOf.has(id)) {
      return { ok: false, error: `Employee ${id} not found.`, status: 404 };
    }
    if (!isInCircle(supervisorOf, manager_id, id)) {
      return { ok: false, error: `Employee ${id} is not a member of this circle.`, status: 400 };
    }
  }
  return { ok: true };
}

async function listCirclePairs(manager_id) {
  const { data, error } = await supabase
    .from('org_chart_seat_swaps')
    .select(swapSelect)
    .eq('manager_id', manager_id)
    .order('member_a_id', { ascending: true })
    .order('member_b_id', { ascending: true });
  if (error) throw error;
  return toPairList(data);
}

export default async function handler(req, res) {
  setCors(res, req);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const rawMid = req.query?.manager_id;
      const mid = rawMid === undefined ? null : Number(rawMid);
      if (mid !== null && !isPositiveInt(mid)) {
        return res.status(400).json({ error: 'manager_id must be a positive integer.' });
      }
      let q = supabase.from('org_chart_seat_swaps').select(swapSelect);
      if (mid !== null) q = q.eq('manager_id', mid);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (!assertAdmin(user, res)) return;

    if (req.method === 'PUT') {
      const { manager_id, swaps } = req.body ?? {};
      const parsed = validateSwapPayload(manager_id, swaps);
      if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });

      const memberIds = [...new Set(parsed.pairs.flat())];
      if (memberIds.length > 0) {
        const check = await checkCircleMembers(manager_id, memberIds);
        if (!check.ok) return res.status(check.status).json({ error: check.error });
      }

      // All reads before any write so a failed insert cannot wipe the circle.
      const oldPairs = await listCirclePairs(manager_id);
      const { error: delError } = await supabase
        .from('org_chart_seat_swaps')
        .delete()
        .eq('manager_id', manager_id);
      if (delError) throw delError;
      if (parsed.pairs.length > 0) {
        const { error: insError } = await supabase.from('org_chart_seat_swaps').insert(
          parsed.pairs.map(([a, b]) => ({
            manager_id,
            member_a_id: a,
            member_b_id: b,
            created_by: user.name || String(user.id),
          }))
        );
        if (insError) throw insError;
      }
      const newPairs = await listCirclePairs(manager_id);
      await safeInsertSeatSwapAudit({
        action: 'seat_swap_save',
        manager_id,
        oldPairs,
        newPairs,
        actor: user,
      });
      const { data, error } = await supabase
        .from('org_chart_seat_swaps')
        .select(swapSelect)
        .eq('manager_id', manager_id);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { manager_id, member_a_id, member_b_id } = req.body ?? {};
      const parsed = validateSwapPayload(manager_id, [[member_a_id, member_b_id]]);
      if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
      const [[a, b]] = parsed.pairs;

      const check = await checkCircleMembers(manager_id, [a, b]);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const oldPairs = await listCirclePairs(manager_id);
      const { error: upError } = await supabase.from('org_chart_seat_swaps').upsert(
        {
          manager_id,
          member_a_id: a,
          member_b_id: b,
          created_by: user.name || String(user.id),
        },
        { onConflict: 'manager_id,member_a_id,member_b_id' }
      );
      if (upError) throw upError;
      const newPairs = await listCirclePairs(manager_id);
      await safeInsertSeatSwapAudit({
        action: 'seat_swap_create',
        manager_id,
        oldPairs,
        newPairs,
        actor: user,
      });
      return res.status(200).json(newPairs);
    }

    if (req.method === 'DELETE') {
      const { manager_id, member_a_id, member_b_id } = req.body ?? {};
      const parsed = validateSwapPayload(manager_id, [[member_a_id, member_b_id]]);
      if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error });
      const [[a, b]] = parsed.pairs;

      const oldPairs = await listCirclePairs(manager_id);
      const { error: delError } = await supabase
        .from('org_chart_seat_swaps')
        .delete()
        .eq('manager_id', manager_id)
        .eq('member_a_id', a)
        .eq('member_b_id', b);
      if (delError) throw delError;
      const newPairs = await listCirclePairs(manager_id);
      await safeInsertSeatSwapAudit({
        action: 'seat_swap_delete',
        manager_id,
        oldPairs,
        newPairs,
        actor: user,
      });
      return res.status(200).json(newPairs);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('org-chart API error:', err);
    dbError(res, err);
  }
}
