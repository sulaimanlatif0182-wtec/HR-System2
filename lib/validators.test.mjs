import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccountEmail, parseProfileUpdate } from './validators.js';

test('parseAccountEmail accepts a valid email and normalizes case', () => {
  const result = parseAccountEmail('  Jane@Example.COM ');
  assert.equal(result.success, true);
  assert.equal(result.email, 'jane@example.com');
});

test('parseAccountEmail rejects an invalid email', () => {
  const result = parseAccountEmail('not-an-email');
  assert.equal(result.success, false);
  assert.match(result.error, /email/i);
});

test('parseProfileUpdate allows known fields', () => {
  const result = parseProfileUpdate({ phone: '012345', number_of_children: '2' });
  assert.equal(result.success, true);
  assert.equal(result.data.phone, '012345');
  assert.equal(result.data.number_of_children, 2);
});

test('parseProfileUpdate rejects unknown fields and bad values', () => {
  assert.equal(parseProfileUpdate({ evil: 1 }).success, false);
  assert.equal(parseProfileUpdate({ number_of_children: -5 }).success, false);
});
