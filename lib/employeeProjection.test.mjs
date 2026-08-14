import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectEmployee,
  PUBLIC_EMPLOYEE_FIELDS,
  SENSITIVE_EMPLOYEE_FIELDS,
} from './employeeProjection.js';

const baseRow = {
  id: 7,
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'employee',
  category: 'employee',
  department: 'Engineering',
  title: 'Engineer',
  status: 'active',
  phone: '123',
  location: 'Factory 1',
  join_date: '2024-01-01',
  employee_no: 'E7',
  avatar_url: null,
  salary: 5000,
  bank_account_no: '12345678',
  epf_no: 'EPF9',
  identity_last4: '1234',
};

test('returns public fields for a non-owner employee viewer', () => {
  const result = projectEmployee(baseRow, { id: 2, role: 'employee' });
  for (const field of PUBLIC_EMPLOYEE_FIELDS) {
    assert.ok(field in result, `expected ${field} present`);
  }
  for (const field of SENSITIVE_EMPLOYEE_FIELDS) {
    assert.ok(!(field in result), `did not expect sensitive field ${field}`);
  }
  assert.equal(result.salary, undefined);
});

test('returns sensitive fields for the record owner', () => {
  const result = projectEmployee(baseRow, { id: 7, role: 'employee' });
  assert.equal(result.salary, 5000);
  assert.equal(result.bank_account_no, '12345678');
});

test('returns sensitive fields for an admin viewer', () => {
  const result = projectEmployee(baseRow, { id: 1, role: 'admin' });
  assert.equal(result.salary, 5000);
  assert.equal(result.epf_no, 'EPF9');
});

test('returns null for null rows', () => {
  assert.equal(projectEmployee(null, { id: 1, role: 'admin' }), null);
});

test('normalizes id to a number', () => {
  const result = projectEmployee({ ...baseRow, id: '7' }, { id: 1, role: 'admin' });
  assert.equal(result.id, 7);
  assert.equal(typeof result.id, 'number');
});
