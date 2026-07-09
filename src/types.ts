export type Role = 'admin' | 'manager' | 'employee';

export interface Employee {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  department: string | null;
  title: string | null;
  status: 'active' | 'on_leave' | 'inactive';
  phone: string | null;
  location: string | null;
  join_date: string | null;
  salary: number | null;
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  color: string;
  budget: number;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'present' | 'late' | 'absent' | 'remote';
  created_at: string;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  requested_at: string;
  decided_by: string | null;
}

export interface PayrollRecord {
  id: number;
  employee_id: number;
  period: string;
  base_salary: number;
  bonus: number;
  deductions: number;
  net_pay: number;
  status: 'pending' | 'paid';
  pay_date: string | null;
}
