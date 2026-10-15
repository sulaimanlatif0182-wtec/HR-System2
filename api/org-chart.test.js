import { describe, it, expect } from 'vitest';
import { canonPair, validateSwapPayload } from '../lib/api/org-chart.js';

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
