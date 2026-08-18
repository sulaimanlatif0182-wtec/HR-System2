import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAccountEmail,
  parseProfileUpdate,
  parseRegister,
  parseWorkerLogin,
  parseDeviceAuth,
  parseLeaveRequest,
  parseClaim,
  parseAttendanceCheckIn,
  parseAttendanceCheckOut,
  parseAttendanceCorrectionRequest,
  parseAttendanceCorrectionDecision,
  parseAttendanceHolidayUpsert,
  parseAttendanceManualCorrection,
  parsePayrollCreate,
  parsePayrollProfile,
  parseDepartmentCreate,
  parseId,
  parsePeriod,
} from './validators.js';

describe('parseAccountEmail', () => {
  it('accepts a valid email and normalizes case', () => {
    const result = parseAccountEmail('  Jane@Example.COM ');
    assert.equal(result.success, true);
    assert.equal(result.email, 'jane@example.com');
  });

  it('rejects an invalid email', () => {
    const result = parseAccountEmail('not-an-email');
    assert.equal(result.success, false);
    assert.match(result.error, /email/i);
  });
});

describe('parseProfileUpdate', () => {
  it('allows known fields', () => {
    const result = parseProfileUpdate({ phone: '012345', number_of_children: '2' });
    assert.equal(result.success, true);
    assert.equal(result.data.phone, '012345');
    assert.equal(result.data.number_of_children, 2);
  });

  it('rejects unknown fields and bad values', () => {
    assert.equal(parseProfileUpdate({ evil: 1 }).success, false);
    assert.equal(parseProfileUpdate({ number_of_children: -5 }).success, false);
  });
});

describe('parseRegister', () => {
  it('accepts a valid email + password', () => {
    const result = parseRegister({ email: 'a@b.com', password: 'Abcd1234' });
    assert.equal(result.success, true);
    assert.equal(result.data.email, 'a@b.com');
  });

  it('rejects a missing email', () => {
    const result = parseRegister({ password: 'Abcd1234' });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });

  it('rejects an invalid email', () => {
    const result = parseRegister({ email: 'nope', password: 'Abcd1234' });
    assert.equal(result.success, false);
  });

  it('rejects a short password', () => {
    const result = parseRegister({ email: 'a@b.com', password: 'short' });
    assert.equal(result.success, false);
  });
});

describe('parseWorkerLogin', () => {
  it('accepts a string employee number', () => {
    const result = parseWorkerLogin({ employee_no: 'E123' });
    assert.equal(result.success, true);
    assert.equal(result.data.employee_no, 'E123');
  });

  it('coerces a numeric employee number', () => {
    const result = parseWorkerLogin({ employee_no: 123 });
    assert.equal(result.success, true);
    assert.equal(result.data.employee_no, '123');
  });

  it('rejects a missing employee number', () => {
    const result = parseWorkerLogin({});
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseDeviceAuth', () => {
  const actions = [
    'registration_options',
    'registration_verify',
    'authentication_options',
    'authentication_verify',
    'approve',
    'revoke',
  ];

  it('accepts every known action', () => {
    for (const action of actions) {
      assert.equal(parseDeviceAuth({ action }).success, true);
    }
  });

  it('rejects an unknown action', () => {
    const result = parseDeviceAuth({ action: 'hack' });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });

  it('rejects a missing action', () => {
    assert.equal(parseDeviceAuth({}).success, false);
  });
});

describe('parseLeaveRequest', () => {
  const valid = {
    employee_id: 5,
    leave_type: 'Annual Leave',
    reason: 'Family event',
    duties_covered_by: 'John',
  };

  it('accepts a valid leave request', () => {
    assert.equal(parseLeaveRequest(valid).success, true);
  });

  it('rejects a missing required field', () => {
    const result = parseLeaveRequest({ ...valid, reason: '' });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });

  it('rejects a bad employee id', () => {
    const result = parseLeaveRequest({ ...valid, employee_id: 'abc' });
    assert.equal(result.success, false);
  });

  it('accepts extra fields (time_off mode) via passthrough', () => {
    const result = parseLeaveRequest({ ...valid, time_off_date: '2026-01-01' });
    assert.equal(result.success, true);
  });
});

describe('parseClaim', () => {
  const valid = {
    employee_id: 3,
    claim_date: '2026-01-01',
    amount: 50,
    description: 'Taxi fare',
  };

  it('accepts a valid claim', () => {
    assert.equal(parseClaim(valid).success, true);
  });

  it('rejects a zero/negative amount', () => {
    assert.equal(parseClaim({ ...valid, amount: 0 }).success, false);
    assert.equal(parseClaim({ ...valid, amount: -5 }).success, false);
  });

  it('rejects a missing description', () => {
    const result = parseClaim({ ...valid, description: '' });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseAttendanceCheckIn', () => {
  const valid = { employee_id: 1, date: '2026-01-01', check_in: '08:00' };

  it('accepts a valid check-in', () => {
    assert.equal(parseAttendanceCheckIn(valid).success, true);
  });

  it('rejects a missing date', () => {
    const result = parseAttendanceCheckIn({ employee_id: 1, check_in: '08:00' });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseAttendanceCheckOut', () => {
  const valid = { id: 9, check_out: '17:30' };

  it('accepts a valid check-out', () => {
    assert.equal(parseAttendanceCheckOut(valid).success, true);
  });

  it('rejects a missing check_out', () => {
    const result = parseAttendanceCheckOut({ id: 9 });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseAttendanceCorrectionRequest', () => {
  const valid = { employee_id: 2, request_date: '2026-01-01', reason: 'Forgot' };

  it('accepts a valid correction request', () => {
    assert.equal(parseAttendanceCorrectionRequest(valid).success, true);
  });

  it('rejects a missing reason', () => {
    const result = parseAttendanceCorrectionRequest({
      employee_id: 2,
      request_date: '2026-01-01',
    });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseAttendanceCorrectionDecision', () => {
  it('accepts a valid decision', () => {
    assert.equal(parseAttendanceCorrectionDecision({ status: 'approved' }).success, true);
  });

  it('rejects a missing status', () => {
    const result = parseAttendanceCorrectionDecision({});
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseAttendanceHolidayUpsert', () => {
  const valid = { holiday_date: '2026-01-01', name: 'New Year' };

  it('accepts a valid holiday', () => {
    assert.equal(parseAttendanceHolidayUpsert(valid).success, true);
  });

  it('rejects an over-long name', () => {
    const result = parseAttendanceHolidayUpsert({
      holiday_date: '2026-01-01',
      name: 'x'.repeat(200),
    });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseAttendanceManualCorrection', () => {
  it('accepts a valid manual correction', () => {
    const result = parseAttendanceManualCorrection({ id: 4, reason: 'Fix' });
    assert.equal(result.success, true);
  });

  it('rejects a missing reason', () => {
    const result = parseAttendanceManualCorrection({ id: 4 });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parsePayrollCreate', () => {
  const valid = { employee_id: 7, period: '2026-01' };

  it('accepts a valid payroll create', () => {
    assert.equal(parsePayrollCreate(valid).success, true);
  });

  it('rejects a missing period', () => {
    const result = parsePayrollCreate({ employee_id: 7 });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parsePayrollProfile', () => {
  it('accepts a valid profile', () => {
    assert.equal(parsePayrollProfile({ employee_id: 8 }).success, true);
  });

  it('rejects a missing employee_id', () => {
    const result = parsePayrollProfile({});
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseDepartmentCreate', () => {
  it('accepts a valid department name', () => {
    assert.equal(parseDepartmentCreate({ name: 'Engineering' }).success, true);
  });

  it('rejects an empty name', () => {
    const result = parseDepartmentCreate({ name: '' });
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});

describe('parseId', () => {
  it('accepts a numeric id (string or number)', () => {
    assert.equal(parseId({ id: 12 }).success, true);
    assert.equal(parseId({ id: '12' }).success, true);
  });

  it('rejects a missing/invalid id', () => {
    assert.equal(parseId({}).success, false);
    assert.equal(parseId({ id: 'abc' }).success, false);
    assert.equal(typeof parseId({}).error, 'string');
  });
});

describe('parsePeriod', () => {
  it('accepts a valid period', () => {
    assert.equal(parsePeriod({ period: '2026-01' }).success, true);
  });

  it('rejects a missing period', () => {
    const result = parsePeriod({});
    assert.equal(result.success, false);
    assert.equal(typeof result.error, 'string');
  });
});