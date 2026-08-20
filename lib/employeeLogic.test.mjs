import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanString,
  generateTempPassword,
  publicEmployee,
  normalizeEmail,
  friendlyDatabaseError,
  toNullableNumber,
  toNullableInteger,
  normalizeIdentityLast4,
  buildEmployeePayload,
  getPeriodRange,
  computeOverallScore,
  escapeHtml,
  daysUntilDate,
} from './employeeLogic.js';

test('cleanString trims and stringifies', () => {
  assert.equal(cleanString('  hello  '), 'hello');
  assert.equal(cleanString(null), '');
  assert.equal(cleanString(undefined), '');
});

test('generateTempPassword is 12 chars with safe charset', () => {
  const password = generateTempPassword();
  assert.equal(password.length, 12);
  assert.ok(/[A-Z]/.test(password));
  assert.ok(/[a-z]/.test(password));
  assert.ok(/[0-9]/.test(password));
  assert.ok(/^[A-Za-z0-9]+$/.test(password));
});

test('publicEmployee returns safe defaults', () => {
  assert.equal(publicEmployee(null), null);
  const row = publicEmployee({ id: 5, name: 'Ali' });
  assert.equal(row.id, 5);
  assert.equal(row.role, 'employee');
  assert.equal(row.status, 'active');
  assert.equal(row.category, 'employee');
});

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  ALI@EXAMPLE.COM '), 'ali@example.com');
});

test('friendlyDatabaseError maps known failures', () => {
  assert.equal(
    friendlyDatabaseError({ message: 'duplicate key value violates unique constraint' }),
    'Duplicate record found. Please check existing data before saving.'
  );
  assert.equal(
    friendlyDatabaseError({ message: 'new row violates row-level security 23505' }),
    'Duplicate record found. Please check existing data before saving.'
  );
  assert.equal(
    friendlyDatabaseError({ message: 'insert violates foreign key constraint' }),
    'Related record was not found. Please refresh and try again.'
  );
  assert.equal(friendlyDatabaseError({ message: 'boom' }), 'boom');
  assert.equal(
    friendlyDatabaseError(new Error('something broke')),
    'something broke'
  );
});

test('toNullableNumber and toNullableInteger handle empties', () => {
  assert.equal(toNullableNumber(null), null);
  assert.equal(toNullableNumber(''), null);
  assert.equal(toNullableNumber('12.5'), 12.5);
  assert.equal(toNullableNumber('abc'), null);
  assert.equal(toNullableInteger('4'), 4);
  assert.equal(toNullableInteger('4.5'), null);
  assert.equal(toNullableInteger(undefined), null);
});

test('normalizeIdentityLast4 strips non-digits for IC, keeps alnum for passport', () => {
  assert.equal(normalizeIdentityLast4('901231-10-1234', 'IC'), '9012');
  assert.equal(normalizeIdentityLast4('abcDEF1234', 'Passport'), 'ABCD');
  assert.equal(normalizeIdentityLast4('12', 'IC'), '12');
});

test('buildEmployeePayload builds a full record', () => {
  const payload = buildEmployeePayload({
    name: '  Ali Baba ',
    email: '  ALI@EXAMPLE.COM ',
    role: 'manager',
    category: 'worker',
    employee_no: 'E100',
    salary: '2500.5',
    identity_type: 'IC',
    identity_last4: '901231-10-5566',
    number_of_children: '2',
    supervisor_id: '7',
  });

  assert.equal(payload.name, 'Ali Baba');
  assert.equal(payload.email, 'ali@example.com');
  assert.equal(payload.role, 'manager');
  assert.equal(payload.category, 'worker');
  assert.equal(payload.employee_no, 'E100');
  assert.equal(payload.salary, 2500.5);
  assert.equal(payload.identity_last4, '9012');
  assert.equal(payload.number_of_children, 2);
  assert.equal(payload.supervisor_id, 7);
  assert.equal(payload.status, 'active');
  assert.match(payload.join_date, /^\d{4}-\d{2}-\d{2}$/);
});

test('buildEmployeePayload partial mode omits missing fields', () => {
  const payload = buildEmployeePayload({ name: 'Bibi' }, { partial: true });
  assert.equal(payload.name, 'Bibi');
  assert.equal(payload.email, undefined);
  assert.equal(payload.role, undefined);
});

test('getPeriodRange returns month bounds', () => {
  assert.deepEqual(getPeriodRange('2026-02'), {
    period: '2026-02',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  });
  assert.deepEqual(getPeriodRange('2028-02').endDate, '2028-02-29');
  assert.equal(getPeriodRange('not-a-date').period.length, 7);
});

test('computeOverallScore averages criteria', () => {
  const sections = [
    {
      criteria: [
        { id: 'a', max_score: 10 },
        { id: 'b', max_score: 10 },
      ],
    },
  ];
  const scores = { a: { score: 8 }, b: { score: 2 } };
  assert.equal(computeOverallScore(scores, sections), 50);
  assert.equal(computeOverallScore({}, []), 0);
});

test('escapeHtml escapes five entities', () => {
  assert.equal(escapeHtml(`<b>"x" & 'y'</b>`), '&lt;b&gt;&quot;x&quot; &amp; &#039;y&#039;&lt;/b&gt;');
  assert.equal(escapeHtml(null), '');
});

test('daysUntilDate computes day difference', () => {
  assert.equal(daysUntilDate(null), null);
  assert.equal(daysUntilDate('not-a-date'), null);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(daysUntilDate(today), 0);
});