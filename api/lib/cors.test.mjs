import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCorsOrigin } from './cors.js';

test('returns req origin when it is in the allowlist', () => {
  assert.equal(
    resolveCorsOrigin('https://app.example.com', 'https://app.example.com,https://a.example.com'),
    'https://app.example.com'
  );
});

test('returns empty string when origin is not in the allowlist', () => {
  assert.equal(resolveCorsOrigin('https://evil.com', 'https://app.example.com'), '');
});

test('returns empty string when no allowlist is configured', () => {
  assert.equal(resolveCorsOrigin('https://app.example.com', ''), '');
});

test('trims whitespace in allowlist entries', () => {
  assert.equal(resolveCorsOrigin('https://a.example.com', ' https://a.example.com '), 'https://a.example.com');
});
