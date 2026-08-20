import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money,
  numberValue,
  formatDate,
  makePassword,
  totalEmployeeDeductions,
  safeFileName,
} from './payslipMath.js';

test('money formats RM with 2 decimals', () => {
  assert.equal(money(2500), 'RM 2,500.00');
  assert.equal(money('50.5'), 'RM 50.50');
  assert.equal(money(0), 'RM 0.00');
  assert.equal(money(null), 'RM 0.00');
});

test('numberValue coerces safely', () => {
  assert.equal(numberValue('12.5'), 12.5);
  assert.equal(numberValue('abc'), 0);
  assert.equal(numberValue(undefined), 0);
  assert.equal(numberValue(null), 0);
});

test('formatDate handles valid, invalid and empty', () => {
  assert.equal(formatDate(null), '-');
  assert.equal(formatDate(''), '-');
  assert.equal(formatDate('not-a-date'), 'not-a-date');
  assert.equal(formatDate('2026-02-10T00:00:00Z'), '10/02/2026');
});

test('makePassword builds YYMMDD + last4', () => {
  assert.equal(makePassword('1990-12-31', '1234'), '9012311234');
  assert.equal(makePassword('1990-12-31', ' 9012'), '9012319012');
  assert.equal(makePassword(null, '1234'), null);
  assert.equal(makePassword('1990-12-31', '12'), null);
  assert.equal(makePassword('1990-12-31', null), null);
  assert.equal(makePassword('not-a-date', '1234'), null);
});

test('totalEmployeeDeductions sums all deduction columns', () => {
  const payroll = {
    epf_employee: 330,
    socso_employee: 15,
    eis_employee: 6,
    pcb: 100,
    leave_deduction: 50,
    lunch_deduction: 10,
    deductions: 25,
  };
  assert.equal(totalEmployeeDeductions(payroll), 536);
  assert.equal(totalEmployeeDeductions({}), 0);
});

test('safeFileName slugs a name', () => {
  assert.equal(safeFileName('Ali Baba', 3), 'ali-baba');
  assert.equal(safeFileName('  ALI  BABA  ', 3), 'ali-baba');
  assert.equal(safeFileName('', 3), 'employee-3');
  assert.equal(safeFileName(undefined, 3), 'employee-3');
  assert.equal(safeFileName('O\'Brien', 1), 'o-brien');
});