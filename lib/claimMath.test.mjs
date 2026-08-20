import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaimPayload,
  normalizeClaimType,
  getDistanceKm,
  isFinanceManager,
  isAdmin,
  isManager,
  sameDepartment,
} from './claimMath.js';

test('normalizeClaimType falls back to Other', () => {
  assert.equal(normalizeClaimType('Fuel'), 'Fuel');
  assert.equal(normalizeClaimType('  Medical  '), 'Medical');
  assert.equal(normalizeClaimType('Unicorn Ride'), 'Other');
  assert.equal(normalizeClaimType(undefined), 'Other');
});

test('getDistanceKm computes and clamps', () => {
  assert.equal(getDistanceKm('100.5', '102.8'), 2.3);
  assert.equal(getDistanceKm('100.5', '98.2'), 0);
  assert.equal(getDistanceKm('100.5', '100.5'), 0);
  assert.equal(getDistanceKm('', '102.8'), 0);
  assert.equal(getDistanceKm('abc', 'def'), 0);
});

test('buildClaimPayload populates fuel fields for Fuel claims', () => {
  const payload = buildClaimPayload({
    employee_id: '9',
    claim_type: 'Fuel',
    claim_date: '2026-02-10',
    amount: '50.00',
    description: '  Petrol for site visit ',
    vehicle_no: 'WT 1234',
    from_location: 'Factory 1',
    to_location: 'Site A',
    odometer_start: '100.5',
    odometer_end: '102.8',
    fuel_liters: '3.2',
    petrol_station: 'Petronas Shah Alam',
    receipt_no: 'R-001',
    attachment_url: 'https://example.com/r.pdf',
  });

  assert.equal(payload.claim_type, 'Fuel');
  assert.equal(payload.employee_id, 9);
  assert.equal(payload.amount, 50);
  assert.equal(payload.description, 'Petrol for site visit');
  assert.equal(payload.vehicle_no, 'WT 1234');
  assert.equal(payload.odometer_start, 100.5);
  assert.equal(payload.odometer_end, 102.8);
  assert.equal(payload.distance_km, 2.3);
  assert.equal(payload.fuel_liters, 3.2);
  assert.equal(payload.petrol_station, 'Petronas Shah Alam');
  assert.equal(payload.status, 'pending_manager');
  assert.equal(payload.included_in_payroll, false);
});

test('buildClaimPayload nulls fuel-only fields for other types', () => {
  const payload = buildClaimPayload({
    employee_id: 4,
    claim_type: 'Medical',
    claim_date: '2026-02-11',
    amount: 80,
    description: 'Clinic visit',
    vehicle_no: 'WT 99',
    odometer_start: 10,
    odometer_end: 20,
    fuel_liters: 5,
    petrol_station: 'Shell',
  });

  assert.equal(payload.claim_type, 'Medical');
  assert.equal(payload.vehicle_no, null);
  assert.equal(payload.odometer_start, null);
  assert.equal(payload.odometer_end, null);
  assert.equal(payload.distance_km, null);
  assert.equal(payload.fuel_liters, null);
  assert.equal(payload.petrol_station, null);
});

test('role helpers detect roles and departments', () => {
  assert.equal(isAdmin('admin'), true);
  assert.equal(isAdmin('manager'), false);
  assert.equal(isManager('MANAGER'), true);
  assert.equal(isFinanceManager('manager', 'finance'), true);
  assert.equal(isFinanceManager('manager', 'sales'), false);
  assert.equal(isFinanceManager('admin', 'finance'), false);
  assert.equal(sameDepartment('Finance', '  finance '), true);
  assert.equal(sameDepartment('Finance', 'Sales'), false);
});