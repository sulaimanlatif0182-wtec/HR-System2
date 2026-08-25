import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanString,
  generateTempPassword,
  publicEmployee,
  normalizeEmail,
  friendlyDatabaseError,
  toNullableNumber,
  toNullableInteger,
  normalizeIdentityLast4,
  pickProfileUpdateData,
  buildEmployeePayload,
  getPeriodRange,
  sanitizeTemplateSections,
  templateCriteriaSections,
  sanitizeEvaluationScores,
  computeOverallScore,
  escapeHtml,
  buildReminderEmail,
  daysUntilDate,
} from '../../lib/employeeLogic.js';

describe('employeeLogic', () => {
  describe('cleanString', () => {
    it('trims whitespace', () => { expect(cleanString('  hello  ')).toBe('hello'); });
    it('handles null/undefined', () => { expect(cleanString(null)).toBe(''); expect(cleanString(undefined)).toBe(''); });
  });

  describe('generateTempPassword', () => {
    it('generates a password of reasonable length', () => {
      const pwd = generateTempPassword();
      expect(pwd.length).toBeGreaterThanOrEqual(12);
    });
    it('contains uppercase, lowercase, and numbers', () => {
      const pwd = generateTempPassword();
      expect(/[A-Z]/.test(pwd)).toBe(true);
      expect(/[a-z]/.test(pwd)).toBe(true);
      expect(/[0-9]/.test(pwd)).toBe(true);
    });
  });

  describe('publicEmployee', () => {
    it('returns safe employee subset', () => {
      const row = { id: 1, name: 'Test', email: 'test@test.com', role: 'admin', category: 'employee', department: 'IT', title: 'Engineer', status: 'active', phone: '123', location: 'HQ', join_date: '2024-01-01', employee_no: 'E001' };
      const result = publicEmployee(row);
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test');
      expect(result.email).toBe('test@test.com');
      expect(result.employee_no).toBe('E001');
    });
    it('returns null for null input', () => { expect(publicEmployee(null)).toBeNull(); });
  });

  describe('normalizeEmail', () => {
    it('lowercases and trims', () => { expect(normalizeEmail('  TEST@EXAMPLE.COM ')).toBe('test@example.com'); });
  });

  describe('friendlyDatabaseError', () => {
    it('returns friendly message for duplicate', () => { expect(friendlyDatabaseError({ message: 'duplicate key value' })).toContain('Duplicate'); });
    it('returns friendly message for foreign key', () => { expect(friendlyDatabaseError({ message: 'violates foreign key' })).toContain('Related record'); });
    it('returns fallback for unknown', () => { expect(friendlyDatabaseError({ message: 'unknown' }, 'fallback')).toBe('fallback'); });
  });

  describe('toNullableNumber', () => {
    it('converts valid numbers', () => { expect(toNullableNumber('5')).toBe(5); expect(toNullableNumber(5)).toBe(5); });
    it('returns null for invalid', () => { expect(toNullableNumber('')).toBeNull(); expect(toNullableNumber(null)).toBeNull(); expect(toNullableNumber('abc')).toBeNull(); });
  });

  describe('toNullableInteger', () => {
    it('converts valid integers', () => { expect(toNullableInteger('5')).toBe(5); });
    it('returns null for non-integers', () => { expect(toNullableInteger('5.5')).toBeNull(); expect(toNullableInteger('')).toBeNull(); });
  });

  describe('normalizeIdentityLast4', () => {
    it('extracts last 4 digits for IC', () => { expect(normalizeIdentityLast4('123456-78-9012', 'IC')).toBe('9012'); });
    it('extracts alphanumeric for passport', () => { expect(normalizeIdentityLast4('A1234567', 'Passport')).toBe('4567'); });
  });

  describe('pickProfileUpdateData', () => {
    it('picks only allowed fields', () => {
      const input = { phone: '123', address: 'addr', bank_name: 'Bank', unknown: 'x' };
      const result = pickProfileUpdateData(input);
      expect(result.phone).toBe('123');
      expect(result.address).toBe('addr');
      expect(result.bank_name).toBe('Bank');
      expect(result.unknown).toBeUndefined();
    });
    it('coerces number_of_children to int', () => { expect(pickProfileUpdateData({ number_of_children: '3' }).number_of_children).toBe(3); });
  });

  describe('buildEmployeePayload', () => {
    it('builds full payload when not partial', () => {
      const payload = buildEmployeePayload({ name: 'John', email: 'john@test.com', role: 'manager', department: 'IT', salary: '5000' }, { partial: false });
      expect(payload.name).toBe('John');
      expect(payload.email).toBe('john@test.com');
      expect(payload.role).toBe('manager');
      expect(payload.department).toBe('IT');
      expect(payload.salary).toBe(5000);
    });
    it('only includes provided fields when partial', () => {
      const payload = buildEmployeePayload({ name: 'Jane' }, { partial: true });
      expect(payload.name).toBe('Jane');
      expect(payload.email).toBeUndefined();
    });
  });

  describe('getPeriodRange', () => {
    it('returns correct range for valid period', () => {
      const range = getPeriodRange('2024-02');
      expect(range.period).toBe('2024-02');
      expect(range.startDate).toBe('2024-02-01');
      expect(range.endDate).toBe('2024-02-29');
    });
    it('falls back to current month for invalid', () => {
      const range = getPeriodRange('invalid');
      expect(range.period).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('sanitizeTemplateSections', () => {
    it('filters invalid sections', () => {
      const sections = [{ name: '', criteria: [] }, { name: 'Valid', criteria: [{ name: 'c1', max_score: 5 }] }];
      const result = sanitizeTemplateSections(sections);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Valid');
    });
  });

  describe('templateCriteriaSections', () => {
    it('flattens criteria', () => {
      const sections = [{ criteria: [{ id: '1', name: 'c1', max_score: 5 }] }];
      expect(templateCriteriaSections(sections).length).toBe(1);
    });
  });

  describe('sanitizeEvaluationScores', () => {
    it('clamps scores to max', () => {
      const sections = [{ criteria: [{ id: '1', max_score: 10 }] }];
      const scores = { '1': { score: 15, comment: 'good' } };
      const result = sanitizeEvaluationScores(scores, sections);
      expect(result['1'].score).toBe(10);
    });
  });

  describe('computeOverallScore', () => {
    it('computes percentage correctly', () => {
      const sections = [{ criteria: [{ id: '1', max_score: 10 }, { id: '2', max_score: 10 }] }];
      const scores = { '1': { score: 5 }, '2': { score: 10 } };
      expect(computeOverallScore(scores, sections)).toBe(75);
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML entities', () => { expect(escapeHtml('<script>alert(1)</script>')).toBe('<script>alert(1)</script>'); });
  });

  describe('buildReminderEmail', () => {
    it('returns html and text', () => {
      const { html, text } = buildReminderEmail([{ reminder_type: 'expiry', employee_name: 'John', title: 'Test', message: 'Message' }]);
      expect(html).toContain('John');
      expect(text).toContain('John');
    });
  });

  describe('daysUntilDate', () => {
    it('returns days until future date', () => {
      const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      expect(daysUntilDate(future)).toBe(5);
    });
    it('returns null for invalid', () => { expect(daysUntilDate('')).toBeNull(); });
  });
});