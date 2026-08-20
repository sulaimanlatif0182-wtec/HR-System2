import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countWorkingLeaveDays,
  calculateTimeOffHours,
  computeLeaveBalance,
} from './leaveMath.js';

test('countWorkingLeaveDays counts Monday-Saturday, excludes Sunday', () => {
  // 2026-01-05 is Monday, 2026-01-11 is Sunday (Jan 2026: 1st=Thu).
  // Jan 5 (Mon) to Jan 11 (Sun) = 6 working days + 1 Sunday.
  assert.equal(countWorkingLeaveDays('2026-01-05', '2026-01-11', {}), 6);
});

test('countWorkingLeaveDays excludes holidays unless working day', () => {
  // 2026-01-01 is Thursday (public holiday), 2026-01-02 Friday.
  const holidays = { '2026-01-01': { is_working_day: false } };
  assert.equal(countWorkingLeaveDays('2026-01-01', '2026-01-02', holidays), 1);

  const workingHoliday = { '2026-01-01': { is_working_day: true } };
  assert.equal(
    countWorkingLeaveDays('2026-01-01', '2026-01-01', workingHoliday),
    1
  );
});

test('countWorkingLeaveDays handles invalid and reversed ranges', () => {
  assert.equal(countWorkingLeaveDays('not-a-date', '2026-01-02', {}), 0);
  assert.equal(countWorkingLeaveDays('2026-01-03', '2026-01-01', {}), 0);
});

test('calculateTimeOffHours converts HH:MM spans to hours', () => {
  assert.equal(calculateTimeOffHours('09:00', '17:00'), 8);
  assert.equal(calculateTimeOffHours('12:00', '12:45'), 0.75);
});

test('calculateTimeOffHours returns 0 for invalid or reversed spans', () => {
  assert.equal(calculateTimeOffHours('17:00', '09:00'), 0);
  assert.equal(calculateTimeOffHours(null, '12:00'), 0);
  assert.equal(calculateTimeOffHours('12:00', null), 0);
  assert.equal(calculateTimeOffHours('', ''), 0);
});

test('computeLeaveBalance is entitlement + adjustments - used', () => {
  assert.equal(
    computeLeaveBalance({ entitlementDays: 12, adjustmentDays: 2, usedDays: 3 }),
    11
  );
  assert.equal(computeLeaveBalance({ entitlementDays: 12 }), 12);
  assert.equal(computeLeaveBalance(), 0);
});