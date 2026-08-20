import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRateLimited,
  clearRateLimiter,
  getClientIp,
} from './rateLimit.js';

test('getClientIp extracts the first x-forwarded-for entry', () => {
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }),
    '1.2.3.4'
  );
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '  9.9.9.9  ' } }),
    '9.9.9.9'
  );
  assert.equal(getClientIp({ headers: {} }), 'anon');
  assert.equal(getClientIp({}), 'anon');
});

test('allows up to max requests then blocks (memory fallback)', async () => {
  clearRateLimiter();
  const opts = { windowMs: 1000, max: 3 };

  assert.equal(await isRateLimited('a', opts), false);
  assert.equal(await isRateLimited('a', opts), false);
  assert.equal(await isRateLimited('a', opts), false);
  // 4th attempt within the window should be blocked
  assert.equal(await isRateLimited('a', opts), true);
});

test('limits per-key independently', async () => {
  clearRateLimiter();
  const opts = { windowMs: 1000, max: 1 };

  assert.equal(await isRateLimited('x', opts), false);
  assert.equal(await isRateLimited('x', opts), true);
  assert.equal(await isRateLimited('y', opts), false);
});

test('window resets after the window lapses', async () => {
  clearRateLimiter();
  const opts = { windowMs: 40, max: 1 };

  assert.equal(await isRateLimited('z', opts), false);
  assert.equal(await isRateLimited('z', opts), true);

  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.equal(await isRateLimited('z', opts), false);
});