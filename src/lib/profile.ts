import type { EmployeeCategory } from '../types';

export interface EmployeeProfile {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  category: EmployeeCategory;
  department: string | null;
  title: string | null;
  status: string;
  phone: string | null;
  location: string | null;
  join_date: string | null;
  salary: number | null;
  avatar_url: string | null;
  employee_no: string | null;
}

export function normalizeRole(role: unknown): 'admin' | 'manager' | 'employee' {
  const value = String(role ?? '').trim().toLowerCase();

  if (value === 'admin') return 'admin';
  if (value === 'manager') return 'manager';

  return 'employee';
}

export function normalizeCategory(category: unknown): EmployeeCategory {
  const value = String(category ?? '').trim().toLowerCase();

  if (value === 'worker') return 'worker';
  if (value === 'manager') return 'manager';

  return 'employee';
}

export function normalizeProfile(data: unknown): EmployeeProfile | null {
  if (!data) return null;

  const row = (
    Array.isArray(data) ? data[0] : data
  ) as Record<string, unknown> | undefined;

  if (!row || typeof row !== 'object') return null;

  const get = (key: string): unknown => row[key];
  const str = (key: string): string | null =>
    get(key) == null ? null : String(get(key));
  const num = (key: string): number | null =>
    get(key) == null ? null : Number(get(key));

  return {
    id: Number(get('id')),
    name: typeof get('name') === 'string' ? (get('name') as string) : '',
    email: typeof get('email') === 'string' ? (get('email') as string) : '',
    role: normalizeRole(get('role')),
    category: normalizeCategory(get('category')),
    department: str('department'),
    title: str('title'),
    status: typeof get('status') === 'string' ? (get('status') as string) : 'active',
    phone: str('phone'),
    location: str('location'),
    join_date: str('join_date'),
    salary: num('salary'),
    avatar_url: str('avatar_url'),
    employee_no: str('employee_no'),
  };
}
