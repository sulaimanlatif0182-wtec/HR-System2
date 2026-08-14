import { describe, it, expect } from 'vitest';
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
    expect(result.success).toBe(true);
    expect(result.email).toBe('jane@example.com');
  });

  it('rejects an invalid email', () => {
    const result = parseAccountEmail('not-an-email');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/email/i);
  });
});

describe('parseProfileUpdate', () => {
  it('allows known fields', () => {
    const result = parseProfileUpdate({ phone: '012345', number_of_children: '2' });
    expect(result.success).toBe(true);
    expect(result.data.phone).toBe('012345');
    expect(result.data.number_of_children).toBe(2);
  });

  it('rejects unknown fields and bad values', () => {
    expect(parseProfileUpdate({ evil: 1 }).success).toBe(false);
    expect(parseProfileUpdate({ number_of_children: -5 }).success).toBe(false);
  });
});

describe('parseRegister', () => {
  it('accepts a valid email + password', () => {
    const result = parseRegister({ email: 'a@b.com', password: 'Abcd1234' });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe('a@b.com');
  });

  it('rejects a missing email', () => {
    const result = parseRegister({ password: 'Abcd1234' });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('rejects an invalid email', () => {
    const result = parseRegister({ email: 'nope', password: 'Abcd1234' });
    expect(result.success).toBe(false);
  });

  it('rejects a short password', () => {
    const result = parseRegister({ email: 'a@b.com', password: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('parseWorkerLogin', () => {
  it('accepts a string employee number', () => {
    const result = parseWorkerLogin({ employee_no: 'E123' });
    expect(result.success).toBe(true);
    expect(result.data.employee_no).toBe('E123');
  });

  it('coerces a numeric employee number', () => {
    const result = parseWorkerLogin({ employee_no: 123 });
    expect(result.success).toBe(true);
    expect(result.data.employee_no).toBe('123');
  });

  it('rejects a missing employee number', () => {
    const result = parseWorkerLogin({});
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
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
      expect(parseDeviceAuth({ action }).success).toBe(true);
    }
  });

  it('rejects an unknown action', () => {
    const result = parseDeviceAuth({ action: 'hack' });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('rejects a missing action', () => {
    expect(parseDeviceAuth({}).success).toBe(false);
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
    expect(parseLeaveRequest(valid).success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const result = parseLeaveRequest({ ...valid, reason: '' });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('rejects a bad employee id', () => {
    const result = parseLeaveRequest({ ...valid, employee_id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('accepts extra fields (time_off mode) via passthrough', () => {
    const result = parseLeaveRequest({ ...valid, time_off_date: '2026-01-01' });
    expect(result.success).toBe(true);
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
    expect(parseClaim(valid).success).toBe(true);
  });

  it('rejects a zero/negative amount', () => {
    expect(parseClaim({ ...valid, amount: 0 }).success).toBe(false);
    expect(parseClaim({ ...valid, amount: -5 }).success).toBe(false);
  });

  it('rejects a missing description', () => {
    const result = parseClaim({ ...valid, description: '' });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseAttendanceCheckIn', () => {
  const valid = { employee_id: 1, date: '2026-01-01', check_in: '08:00' };

  it('accepts a valid check-in', () => {
    expect(parseAttendanceCheckIn(valid).success).toBe(true);
  });

  it('rejects a missing date', () => {
    const result = parseAttendanceCheckIn({ employee_id: 1, check_in: '08:00' });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseAttendanceCheckOut', () => {
  const valid = { id: 9, check_out: '17:30' };

  it('accepts a valid check-out', () => {
    expect(parseAttendanceCheckOut(valid).success).toBe(true);
  });

  it('rejects a missing check_out', () => {
    const result = parseAttendanceCheckOut({ id: 9 });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseAttendanceCorrectionRequest', () => {
  const valid = { employee_id: 2, request_date: '2026-01-01', reason: 'Forgot' };

  it('accepts a valid correction request', () => {
    expect(parseAttendanceCorrectionRequest(valid).success).toBe(true);
  });

  it('rejects a missing reason', () => {
    const result = parseAttendanceCorrectionRequest({
      employee_id: 2,
      request_date: '2026-01-01',
    });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseAttendanceCorrectionDecision', () => {
  it('accepts a valid decision', () => {
    expect(parseAttendanceCorrectionDecision({ status: 'approved' }).success).toBe(true);
  });

  it('rejects a missing status', () => {
    const result = parseAttendanceCorrectionDecision({});
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseAttendanceHolidayUpsert', () => {
  const valid = { holiday_date: '2026-01-01', name: 'New Year' };

  it('accepts a valid holiday', () => {
    expect(parseAttendanceHolidayUpsert(valid).success).toBe(true);
  });

  it('rejects an over-long name', () => {
    const result = parseAttendanceHolidayUpsert({
      holiday_date: '2026-01-01',
      name: 'x'.repeat(200),
    });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseAttendanceManualCorrection', () => {
  it('accepts a valid manual correction', () => {
    const result = parseAttendanceManualCorrection({ id: 4, reason: 'Fix' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing reason', () => {
    const result = parseAttendanceManualCorrection({ id: 4 });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parsePayrollCreate', () => {
  const valid = { employee_id: 7, period: '2026-01' };

  it('accepts a valid payroll create', () => {
    expect(parsePayrollCreate(valid).success).toBe(true);
  });

  it('rejects a missing period', () => {
    const result = parsePayrollCreate({ employee_id: 7 });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parsePayrollProfile', () => {
  it('accepts a valid profile', () => {
    expect(parsePayrollProfile({ employee_id: 8 }).success).toBe(true);
  });

  it('rejects a missing employee_id', () => {
    const result = parsePayrollProfile({});
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseDepartmentCreate', () => {
  it('accepts a valid department name', () => {
    expect(parseDepartmentCreate({ name: 'Engineering' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = parseDepartmentCreate({ name: '' });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('parseId', () => {
  it('accepts a numeric id (string or number)', () => {
    expect(parseId({ id: 12 }).success).toBe(true);
    expect(parseId({ id: '12' }).success).toBe(true);
  });

  it('rejects a missing/invalid id', () => {
    expect(parseId({}).success).toBe(false);
    expect(parseId({ id: 'abc' }).success).toBe(false);
    expect(typeof parseId({}).error).toBe('string');
  });
});

describe('parsePeriod', () => {
  it('accepts a valid period', () => {
    expect(parsePeriod({ period: '2026-01' }).success).toBe(true);
  });

  it('rejects a missing period', () => {
    const result = parsePeriod({});
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});
