import test from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimited, clearRateLimiter } from './rateLimit.js';

test('allows up to max requests then blocks', () => {
  clearRateLimiter();
  const opts = { windowMs: 1000, max: 3 };

  assert.equal(isRateLimited('a', opts), false);
  assert.equal(isRateLimited('a', opts), false);
  assert.equal(isRateLimited('a', opts), false);
  // 4th attempt within the window should be blocked
  assert.equal(isRateLimited('a', opts), true);
});

test('limits per-key independently', () => {
  clearRateLimiter();
  const opts = { windowMs: 1000, max: 1 };

  assert.equal(isRateLimited('x', opts), false);
  assert.equal(isRateLimited('x', opts), true);
  assert.equal(isRateLimited('y', opts), false);
});
