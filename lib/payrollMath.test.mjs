import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStatutoryContributions,
  calculatePayrollTotals,
  calculateLeaveDeductions,
} from './payrollMath.js';

const SETTINGS = {
  epf_enabled: true,
  epf_employee_rate_local_under60: 11,
  epf_employee_rate_local_60_above: 5.5,
  epf_employee_rate_foreign: 11,
  epf_employer_rate_under_5000: 13,
  epf_employer_rate_5000_above: 12,
  epf_employer_rate_60_above: 6.5,
  socso_enabled: true,
  socso_employee_rate: 0.5,
  socso_employer_rate: 1.75,
  socso_wage_cap: 5000,
  eis_enabled: true,
  eis_employee_rate: 0.2,
  eis_employer_rate: 0.2,
  eis_wage_cap: 5000,
};

test('calculateStatutoryContributions applies local under-60 EPF rates', () => {
  const result = calculateStatutoryContributions(
    4000,
    {},
    SETTINGS,
    { citizenship_type: 'local' }
  );

  assert.equal(result.epf_employee, 440); // 11% of 4000
  assert.equal(result.epf_employer, 520); // 13% of 4000
  assert.equal(result.socso_employee, 20); // 0.5% of 4000
  assert.equal(result.socso_employer, 70); // 1.75% of 4000
  assert.equal(result.socso_source, 'fallback_rate');
  assert.equal(result.pcb, 0);
});

test('calculateStatutoryContributions honours foreign rates and overrides', () => {
  const foreign = calculateStatutoryContributions(4000, {}, SETTINGS, {
    citizenship_type: 'foreign',
  });
  assert.equal(foreign.epf_employee, 440);
  assert.equal(foreign.epf_employer, 520);

  const override = calculateStatutoryContributions(4000, {}, SETTINGS, {
    citizenship_type: 'local',
    epf_employee_rate_override: 9,
    epf_employer_rate_override: 12,
  });
  assert.equal(override.epf_employee, 360);
  assert.equal(override.epf_employer, 480);
});

test('calculateStatutoryContributions uses age-60+ EPF rates', () => {
  const result = calculateStatutoryContributions(4000, {}, SETTINGS, {
    citizenship_type: 'local',
    date_of_birth: '1960-01-01',
  });
  assert.equal(result.epf_employee, 220); // 5.5%
  assert.equal(result.epf_employer, 260); // 6.5%
  assert.ok(result.age >= 60);
});

test('calculateStatutoryContributions uses wage table rows when present', () => {
  const tables = [
    { scheme: 'SOCSO', active: true, wage_from: 0, wage_to: 1000, employee_amount: 30, employer_amount: 60 },
  ];
  const result = calculateStatutoryContributions(500, {}, SETTINGS, {
    citizenship_type: 'local',
    socso_category: 'standard',
  }, tables);

  assert.equal(result.socso_employee, 30);
  assert.equal(result.socso_employer, 60);
  assert.equal(result.socso_source, 'table');
});

test('calculateStatutoryContributions zeroes SOCSO when not applicable', () => {
  const result = calculateStatutoryContributions(4000, {}, SETTINGS, {
    citizenship_type: 'local',
    socso_category: 'not_applicable',
  });
  assert.equal(result.socso_employee, 0);
  assert.equal(result.socso_employer, 0);
});

test('calculatePayrollTotals computes gross and net from parts', () => {
  const result = calculatePayrollTotals({
    base_salary: 3000,
    bonus: 500,
    ot_pay: 100,
    claim_amount: 50,
    leave_deduction: 0,
    lunch_deduction: 0,
    deductions: 0,
    epf_employee: 330,
    socso_employee: 15,
    eis_employee: 6,
    pcb: 0,
  });

  assert.equal(result.gross_pay, 3650);
  assert.equal(result.net_pay, 3299);
});

test('calculatePayrollTotals honours explicit gross/net overrides', () => {
  const result = calculatePayrollTotals({
    base_salary: 3000,
    gross_pay: 4000,
    net_pay: 3800,
    bonus: 0,
    ot_pay: 0,
    claim_amount: 0,
    leave_deduction: 0,
    lunch_deduction: 0,
    deductions: 0,
    epf_employee: 0,
    socso_employee: 0,
    eis_employee: 0,
    pcb: 0,
  });

  assert.equal(result.gross_pay, 4000);
  assert.equal(result.net_pay, 3800);
});

test('calculateLeaveDeductions combines unpaid, negative and time-off', () => {
  const result = calculateLeaveDeductions({
    leaveRows: [
      { leave_type: 'Unpaid Leave', days: 2, start_date: '2026-02-02' },
      { leave_type: 'Annual Leave', days: 3, request_mode: 'time_off', time_off_date: '2026-02-03', time_off_hours: 2 },
    ],
    entitlements: { 'Annual Leave': 10 },
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    dailyRate: 100,
    hourlyRate: 20,
  });

  assert.equal(result.unpaidLeaveDays, 2);
  assert.equal(result.negativeLeaveDays, 0);
  assert.equal(result.timeOffHours, 2);
  assert.equal(result.leaveDeduction, 240); // 2*100 + 0 + 2*20
});

test('calculateLeaveDeductions charges negative leave beyond entitlement', () => {
  const result = calculateLeaveDeductions({
    leaveRows: [
      { leave_type: 'Annual Leave', days: 12, start_date: '2026-02-03' },
    ],
    entitlements: { 'Annual Leave': 10 },
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    dailyRate: 100,
    hourlyRate: 20,
  });

  assert.equal(result.negativeLeaveDays, 2);
  assert.equal(result.leaveDeduction, 200);
});