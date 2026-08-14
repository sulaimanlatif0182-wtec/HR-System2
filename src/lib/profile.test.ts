import { describe, it, expect } from 'vitest';
import {
  normalizeProfile,
  normalizeRole,
  normalizeCategory,
} from './profile';

describe('normalizeProfile', () => {
  it('returns null for nullish / non-object input', () => {
    expect(normalizeProfile(null)).toBeNull();
    expect(normalizeProfile(undefined)).toBeNull();
    expect(normalizeProfile('')).toBeNull();
    expect(normalizeProfile(42)).toBeNull();
  });

  it('normalizes a plain object row and coerces types', () => {
    const p = normalizeProfile({
      id: '7',
      name: 'Jane',
      email: 'J@X.COM',
      role: 'ADMIN',
      category: 'Worker',
      salary: '5000',
    });

    expect(p?.id).toBe(7);
    expect(p?.name).toBe('Jane');
    expect(p?.role).toBe('admin');
    expect(p?.category).toBe('worker');
    expect(p?.salary).toBe(5000);
  });

  it('handles an array payload by taking the first row', () => {
    const p = normalizeProfile([{ id: 3, name: 'Bob' }]);
    expect(p?.id).toBe(3);
  });

  it('returns null for salary when missing', () => {
    const p = normalizeProfile({ id: 1, name: 'X' });
    expect(p?.salary).toBeNull();
  });
});

describe('normalizeRole / normalizeCategory', () => {
  it('falls back to employee for unknown values', () => {
    expect(normalizeRole('something')).toBe('employee');
    expect(normalizeRole(null)).toBe('employee');
    expect(normalizeCategory(undefined)).toBe('employee');
    expect(normalizeCategory('MANAGER')).toBe('manager');
  });
});
