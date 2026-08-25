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
  parseId,
  parsePeriod,
  parseDepartmentCreate,
} from '../../lib/validators.js';

describe('validators', () => {
  describe('parseAccountEmail', () => {
    it('accepts valid email', () => { expect(parseAccountEmail('test@example.com').success).toBe(true); });
    it('rejects invalid email', () => { expect(parseAccountEmail('invalid').success).toBe(false); });
  });

  describe('parseProfileUpdate', () => {
    it('accepts valid profile', () => { expect(parseProfileUpdate({ phone: '123', address: 'addr' }).success).toBe(true); });
    it('rejects too long phone', () => { expect(parseProfileUpdate({ phone: 'x'.repeat(50) }).success).toBe(false); });
    it('coerces number_of_children', () => { expect(parseProfileUpdate({ number_of_children: '3' }).success).toBe(true); });
  });

  describe('parseRegister', () => {
    it('accepts valid email and password', () => { expect(parseRegister({ email: 'test@example.com', password: 'password123' }).success).toBe(true); });
    it('rejects short password', () => { expect(parseRegister({ email: 'test@example.com', password: 'short' }).success).toBe(false); });
  });

  describe('parseWorkerLogin', () => {
    it('accepts employee_no', () => { expect(parseWorkerLogin({ employee_no: 'E001' }).success).toBe(true); });
    it('rejects empty', () => { expect(parseWorkerLogin({ employee_no: '' }).success).toBe(false); });
  });

  describe('parseDeviceAuth', () => {
    it('accepts valid actions', () => { expect(parseDeviceAuth({ action: 'registration_options' }).success).toBe(true); expect(parseDeviceAuth({ action: 'approve' }).success).toBe(true); });
    it('rejects invalid action', () => { expect(parseDeviceAuth({ action: 'invalid' }).success).toBe(false); });
  });

  describe('parseLeaveRequest', () => {
    it('accepts required fields', () => { expect(parseLeaveRequest({ employee_id: 1, leave_type: 'Annual', reason: 'Vacation', duties_covered_by: 'Jane' }).success).toBe(true); });
    it('rejects missing required', () => { expect(parseLeaveRequest({}).success).toBe(false); });
  });

  describe('parseClaim', () => {
    it('accepts valid claim', () => { expect(parseClaim({ employee_id: 1, claim_date: '2024-01-15', amount: 100, description: 'Travel' }).success).toBe(true); });
    it('rejects negative amount', () => { expect(parseClaim({ employee_id: 1, claim_date: '2024-01-15', amount: -50, description: 'Test' }).success).toBe(false); });
  });

  describe('parseAttendanceCheckIn', () => {
    it('accepts required fields', () => { expect(parseAttendanceCheckIn({ employee_id: 1, date: '2024-01-15', check_in: '09:00' }).success).toBe(true); });
  });

  describe('parseAttendanceCheckOut', () => {
    it('accepts id and check_out', () => { expect(parseAttendanceCheckOut({ id: 1, check_out: '17:00' }).success).toBe(true); });
  });

  describe('parseAttendanceCorrectionRequest', () => {
    it('accepts required fields', () => { expect(parseAttendanceCorrectionRequest({ employee_id: 1, request_date: '2024-01-15', reason: 'Forgot to check in' }).success).toBe(true); });
  });

  describe('parseAttendanceCorrectionDecision', () => {
    it('accepts status', () => { expect(parseAttendanceCorrectionDecision({ status: 'approved' }).success).toBe(true); });
  });

  describe('parseAttendanceHolidayUpsert', () => {
    it('accepts holiday_date and name', () => { expect(parseAttendanceHolidayUpsert({ holiday_date: '2024-01-01', name: 'New Year' }).success).toBe(true); });
  });

  describe('parseAttendanceManualCorrection', () => {
    it('accepts id and reason', () => { expect(parseAttendanceManualCorrection({ id: 1, reason: 'Correction' }).success).toBe(true); });
  });

  describe('parsePayrollCreate', () => {
    it('accepts employee_id and period', () => { expect(parsePayrollCreate({ employee_id: 1, period: '2024-01' }).success).toBe(true); });
  });

  describe('parsePayrollProfile', () => {
    it('accepts employee_id', () => { expect(parsePayrollProfile({ employee_id: 1 }).success).toBe(true); });
  });

  describe('parseId', () => {
    it('accepts valid id', () => { expect(parseId({ id: '1' }).success).toBe(true); });
    it('rejects non-numeric', () => { expect(parseId({ id: 'abc' }).success).toBe(false); });
  });

  describe('parsePeriod', () => {
    it('accepts period', () => { expect(parsePeriod({ period: '2024-01' }).success).toBe(true); });
    it('rejects missing', () => { expect(parsePeriod({}).success).toBe(false); });
  });

  describe('parseDepartmentCreate', () => {
    it('accepts name', () => { expect(parseDepartmentCreate({ name: 'Engineering' }).success).toBe(true); });
    it('rejects empty name', () => { expect(parseDepartmentCreate({ name: '' }).success).toBe(false); });
  });
});