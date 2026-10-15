import { describe, it, expect } from 'vitest';
import { canonPair, validateSwapPayload, isInCircle, diffCirclePairs } from '../lib/api/org-chart.js';

describe('canonPair', () => {
  it('orders pairs', () => {
    expect(canonPair(92, 74)).toEqual([74, 92]);
    expect(canonPair(74, 92)).toEqual([74, 92]);
  });
});

describe('validateSwapPayload', () => {
  it('accepts a valid pair', () => {
    expect(validateSwapPayload(66, [[74, 92]])).toEqual({ ok: true, pairs: [[74, 92]] });
  });
  it('canonicalizes reversed pairs', () => {
    expect(validateSwapPayload(66, [[92, 74]])).toEqual({ ok: true, pairs: [[74, 92]] });
  });
  it('dedupes exact duplicate pairs', () => {
    expect(validateSwapPayload(66, [[74, 92], [92, 74]])).toEqual({ ok: true, pairs: [[74, 92]] });
  });
  it('rejects self-pair', () => {
    const r = validateSwapPayload(66, [[74, 74]]);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
  it('rejects manager as member', () => {
    expect(validateSwapPayload(66, [[66, 74]]).ok).toBe(false);
    expect(validateSwapPayload(66, [[74, 66]]).ok).toBe(false);
  });
  it('rejects non-integers', () => {
    expect(validateSwapPayload(66, [['74', 92]]).ok).toBe(false);
    expect(validateSwapPayload('66', [[74, 92]]).ok).toBe(false);
    expect(validateSwapPayload(66, [[74.5, 92]]).ok).toBe(false);
  });
  it('rejects a member reused across pairs', () => {
    const r = validateSwapPayload(66, [[74, 92], [74, 88]]);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
  it('rejects non-array swaps', () => {
    expect(validateSwapPayload(66, 'nope').ok).toBe(false);
  });
});

describe('isInCircle', () => {
  // Henry (66) -> Stephannie (70) -> Muhamad Afiq (95); 999 reports elsewhere.
  const chain = new Map([
    [66, null],
    [70, 66],
    [95, 70],
    [999, 1000],
  ]);
  it('accepts a direct report', () => {
    expect(isInCircle(chain, 66, 70)).toBe(true);
  });
  it('accepts an indirect report deeper in the subtree', () => {
    expect(isInCircle(chain, 66, 95)).toBe(true);
  });
  it('rejects a member of another tree', () => {
    expect(isInCircle(chain, 66, 999)).toBe(false);
  });
  it('rejects an unknown id', () => {
    expect(isInCircle(chain, 66, 12345)).toBe(false);
  });
  it('terminates on a supervisor cycle', () => {
    const cyclic = new Map([
      [1, 2],
      [2, 1],
    ]);
    expect(isInCircle(cyclic, 66, 1)).toBe(false);
  });
});

describe('diffCirclePairs', () => {
  it('inserts only genuinely new pairs and deletes nothing when growing', () => {
    const d = diffCirclePairs(
      [
        [74, 92],
      ],
      [
        [74, 92],
        [77, 88],
      ]
    );
    expect(d.toInsert).toEqual([[77, 88]]);
    expect(d.toDeleteFirst).toEqual([]);
    expect(d.toDeleteRest).toEqual([]);
  });
  it('deletes all old pairs when clearing', () => {
    const d = diffCirclePairs(
      [
        [74, 92],
      ],
      []
    );
    expect(d.toInsert).toEqual([]);
    expect(d.toDeleteFirst).toEqual([]);
    expect(d.toDeleteRest).toEqual([[74, 92]]);
  });
  it('deletes conflicting stale rows first so the member-reuse trigger cannot fire', () => {
    // Old [74,92] shares member 74 with new [74,88]: [74,92] must go
    // before the insert, while unrelated stale [77,69] can go after.
    const d = diffCirclePairs(
      [
        [74, 92],
        [77, 69],
      ],
      [[74, 88]]
    );
    expect(d.toInsert).toEqual([[74, 88]]);
    expect(d.toDeleteFirst).toEqual([[74, 92]]);
    expect(d.toDeleteRest).toEqual([[77, 69]]);
  });
  it('is a no-op when old and new match', () => {
    const d = diffCirclePairs(
      [
        [74, 92],
      ],
      [[74, 92]]
    );
    expect(d).toEqual({ toInsert: [], toDeleteFirst: [], toDeleteRest: [] });
  });
});
