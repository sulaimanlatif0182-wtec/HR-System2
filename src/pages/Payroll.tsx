import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  TrendingUp,
  FileText,
  Download,
  Upload,
  Plus,
  Pencil,
  X,
  Loader2,
  CheckCircle2,
  Rocket,
  Save,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/ui';

const PIE_COLORS = [
  '#8b5cf6',
  '#22d3ee',
  '#fbbf24',
  '#fb7185',
  '#34d399',
  '#6366f1',
];

const PAYROLL_STATUSES = ['draft', 'reviewed', 'approved', 'released', 'paid'];

function currentPeriod() {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

interface PayRec {
  id: number;
  employee_id: number;
  period: string;
  base_salary: number;
  bonus: number;
  deductions: number;
  net_pay: number;
  status: string;

  gross_pay?: number | null;
  ot_hours?: number | null;
  ot_rate?: number | null;
  ot_pay?: number | null;
  claim_amount?: number | null;
  leave_deduction?: number | null;
  unpaid_leave_days?: number | null;

  epf_employee?: number | null;
  epf_employer?: number | null;
  socso_employee?: number | null;
  socso_employer?: number | null;
  eis_employee?: number | null;
  eis_employer?: number | null;
  pcb?: number | null;

  batch_id?: number | null;
  released_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  remarks?: string | null;
}

interface Emp {
  id: number;
  name: string;
  email?: string | null;
  department: string | null;
}

interface PayrollBatch {
  id: number;
  period: string;
  status: string;
  total_gross: number;
  total_net: number;
  total_epf_employee: number;
  total_epf_employer: number;
  total_socso_employee: number;
  total_socso_employer: number;
  total_eis_employee: number;
  total_eis_employer: number;
  total_pcb: number;
  total_claims: number;
  total_ot: number;
  total_deductions: number;
  approved_by?: string | null;
  approved_at?: string | null;
  released_by?: string | null;
  released_at?: string | null;
}

interface PayrollFormState {
  id?: number | null;
  employee_id: string;
  period: string;
  base_salary: string;
  bonus: string;
  deductions: string;
  gross_pay: string;
  ot_hours: string;
  ot_rate: string;
  ot_pay: string;
  claim_amount: string;
  leave_deduction: string;
  unpaid_leave_days: string;
  epf_employee: string;
  epf_employer: string;
  socso_employee: string;
  socso_employer: string;
  eis_employee: string;
  eis_employer: string;
  pcb: string;
  net_pay: string;
  status: string;
  remarks: string;
}

type PayrollFormStringKey = Exclude<keyof PayrollFormState, 'id'>;

const PAYROLL_NUMBER_FIELDS: Array<[PayrollFormStringKey, string]> = [
  ['base_salary', 'Base Salary'],
  ['bonus', 'Bonus'],
  ['ot_hours', 'OT Hours'],
  ['ot_rate', 'OT Rate'],
  ['ot_pay', 'OT Pay'],
  ['claim_amount', 'Claims'],
  ['leave_deduction', 'Leave Deduction'],
  ['unpaid_leave_days', 'Unpaid Leave Days'],
  ['epf_employee', 'EPF Employee'],
  ['epf_employer', 'EPF Employer'],
  ['socso_employee', 'SOCSO Employee'],
  ['socso_employer', 'SOCSO Employer'],
  ['eis_employee', 'EIS Employee'],
  ['eis_employer', 'EIS Employer'],
  ['pcb', 'PCB'],
  ['deductions', 'Other Deductions'],
];

function numberValue(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function money(value: unknown) {
  return `RM ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return '""';

  const stringValue = String(value).replace(/"/g, '""');

  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') i++;

      row.push(current.trim());
      current = '';

      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());

  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }

  const headers = rows[0] || [];

  return rows.slice(1).map((values) => {
    const item: Record<string, string> = {};

    headers.forEach((header, index) => {
      item[header.trim()] = values[index] ?? '';
    });

    return item;
  });
}

function emptyPayrollForm(period = currentPeriod()): PayrollFormState {
  return {
    id: null,
    employee_id: '',
    period,
    base_salary: '0',
    bonus: '0',
    deductions: '0',
    gross_pay: '0',
    ot_hours: '0',
    ot_rate: '0',
    ot_pay: '0',
    claim_amount: '0',
    leave_deduction: '0',
    unpaid_leave_days: '0',
    epf_employee: '0',
    epf_employer: '0',
    socso_employee: '0',
    socso_employer: '0',
    eis_employee: '0',
    eis_employer: '0',
    pcb: '0',
    net_pay: '0',
    status: 'draft',
    remarks: '',
  };
}

function formFromRecord(record: PayRec): PayrollFormState {
  return {
    id: record.id,
    employee_id: String(record.employee_id),
    period: record.period,
    base_salary: String(record.base_salary ?? 0),
    bonus: String(record.bonus ?? 0),
    deductions: String(record.deductions ?? 0),
    gross_pay: String(record.gross_pay ?? 0),
    ot_hours: String(record.ot_hours ?? 0),
    ot_rate: String(record.ot_rate ?? 0),
    ot_pay: String(record.ot_pay ?? 0),
    claim_amount: String(record.claim_amount ?? 0),
    leave_deduction: String(record.leave_deduction ?? 0),
    unpaid_leave_days: String(record.unpaid_leave_days ?? 0),
    epf_employee: String(record.epf_employee ?? 0),
    epf_employer: String(record.epf_employer ?? 0),
    socso_employee: String(record.socso_employee ?? 0),
    socso_employer: String(record.socso_employer ?? 0),
    eis_employee: String(record.eis_employee ?? 0),
    eis_employer: String(record.eis_employer ?? 0),
    pcb: String(record.pcb ?? 0),
    net_pay: String(record.net_pay ?? 0),
    status: record.status ?? 'draft',
    remarks: record.remarks ?? '',
  };
}

export default function Payroll() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isManagerOnly = profile?.role === 'manager';
  const isAdminOrManager =
    profile?.role === 'admin' || profile?.role === 'manager';

  const profileDepartment = String(profile?.department ?? '')
    .trim()
    .toLowerCase();

  const [records, setRecords] = useState<PayRec[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [payrollForm, setPayrollForm] = useState<PayrollFormState>(
    emptyPayrollForm()
  );
  const [formError, setFormError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');

    try {
      const [pay, emp, batchData] = await Promise.all([
        fetch('/api/payroll').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
        fetch('/api/payroll?batches=true').then((r) => r.json()),
      ]);

      setRecords(Array.isArray(pay) ? pay : []);
      setEmployees(Array.isArray(emp) ? emp : []);
      setBatches(Array.isArray(batchData) ? batchData : []);
    } catch {
      setError('Failed to load payroll data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const empMap = useMemo(() => {
    const m: Record<number, Emp> = {};

    employees.forEach((employee) => {
      m[employee.id] = employee;
    });

    return m;
  }, [employees]);

  const visibleEmployees = useMemo(() => {
    if (isAdmin) {
      return employees;
    }

    if (isManagerOnly) {
      return employees.filter(
        (employee) =>
          String(employee.department ?? '').trim().toLowerCase() ===
          profileDepartment
      );
    }

    return employees.filter((employee) => employee.id === profile?.id);
  }, [employees, isAdmin, isManagerOnly, profile?.id, profileDepartment]);

  const visibleEmployeeIds = useMemo(
    () => new Set(visibleEmployees.map((employee) => employee.id)),
    [visibleEmployees]
  );

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.period === selectedPeriod) || null,
    [batches, selectedPeriod]
  );

  const visible = useMemo(() => {
    let list = records.filter((record) => record.period === selectedPeriod);

    if (isAdmin) {
      return list;
    }

    list = list.filter((record) => visibleEmployeeIds.has(record.employee_id));

    if (!isAdminOrManager) {
      list = list.filter(
        (record) => record.status === 'released' || record.status === 'paid'
      );
    }

    return list;
  }, [records, selectedPeriod, visibleEmployeeIds, isAdmin, isAdminOrManager]);

  const deptSplit = useMemo(() => {
    const map: Record<string, number> = {};

    visible.forEach((record) => {
      const department = empMap[record.employee_id]?.department || 'Unassigned';
      map[department] = (map[department] || 0) + Number(record.net_pay);
    });

    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));
  }, [visible, empMap]);

  const totalGross = visible.reduce(
    (sum, record) => sum + numberValue(record.gross_pay),
    0
  );

  const totalNet = visible.reduce(
    (sum, record) => sum + numberValue(record.net_pay),
    0
  );

  const totalOt = visible.reduce(
    (sum, record) => sum + numberValue(record.ot_pay),
    0
  );

  const totalClaims = visible.reduce(
    (sum, record) => sum + numberValue(record.claim_amount),
    0
  );

  const paidOrReleased = visible.filter(
    (record) => record.status === 'released' || record.status === 'paid'
  ).length;

  const formatPayrollRow = (record: PayRec) => ({
    ID: record.id,
    Employee_ID: record.employee_id,
    Employee_Name: empMap[record.employee_id]?.name ?? `#${record.employee_id}`,
    Department: empMap[record.employee_id]?.department ?? '',
    Period: record.period,
    Base_Salary: record.base_salary,
    Gross_Pay: record.gross_pay ?? '',
    Bonus: record.bonus,
    OT_Hours: record.ot_hours ?? '',
    OT_Rate: record.ot_rate ?? '',
    OT_Pay: record.ot_pay ?? '',
    Claim_Amount: record.claim_amount ?? '',
    Leave_Deduction: record.leave_deduction ?? '',
    Unpaid_Leave_Days: record.unpaid_leave_days ?? '',
    EPF_Employee: record.epf_employee ?? '',
    EPF_Employer: record.epf_employer ?? '',
    SOCSO_Employee: record.socso_employee ?? '',
    SOCSO_Employer: record.socso_employer ?? '',
    EIS_Employee: record.eis_employee ?? '',
    EIS_Employer: record.eis_employer ?? '',
    PCB: record.pcb ?? '',
    Deductions: record.deductions,
    Net_Pay: record.net_pay,
    Status: record.status,
    Remarks: record.remarks ?? '',
  });

  const handleExportCsv = () => {
    const rows = visible.map(formatPayrollRow);

    downloadCsv(`payroll-${selectedPeriod}.csv`, rows);
  };

  const handleExportSinglePayslip = (record: PayRec) => {
    const employeeName =
      empMap[record.employee_id]?.name ?? `employee-${record.employee_id}`;

    const safeEmployeeName = employeeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    downloadCsv(`payslip-${safeEmployeeName}-${record.period}.csv`, [
      formatPayrollRow(record),
    ]);
  };

  const openCreateForm = () => {
    setPayrollForm(emptyPayrollForm(selectedPeriod));
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (record: PayRec) => {
    setPayrollForm(formFromRecord(record));
    setFormError('');
    setShowForm(true);
  };

  const updatePayrollForm = (key: keyof PayrollFormState, value: string) => {
    const next = {
      ...payrollForm,
      [key]: value,
    };

    const gross =
      numberValue(next.base_salary) +
      numberValue(next.bonus) +
      numberValue(next.ot_pay) +
      numberValue(next.claim_amount);

    const totalDeductions =
      numberValue(next.deductions) +
      numberValue(next.leave_deduction) +
      numberValue(next.epf_employee) +
      numberValue(next.socso_employee) +
      numberValue(next.eis_employee) +
      numberValue(next.pcb);

    next.gross_pay = String(Math.round(gross * 100) / 100);
    next.net_pay = String(Math.round((gross - totalDeductions) * 100) / 100);

    setPayrollForm(next);
  };

  const savePayrollRecord = async (e: FormEvent) => {
    e.preventDefault();

    if (!isAdmin) return;

    if (!payrollForm.employee_id || !payrollForm.period) {
      setFormError('Employee and period are required.');
      return;
    }

    setActionLoading(true);
    setFormError('');

    try {
      const payload = {
        id: payrollForm.id,
        employee_id: Number(payrollForm.employee_id),
        period: payrollForm.period,
        base_salary: numberValue(payrollForm.base_salary),
        bonus: numberValue(payrollForm.bonus),
        deductions: numberValue(payrollForm.deductions),
        gross_pay: numberValue(payrollForm.gross_pay),
        ot_hours: numberValue(payrollForm.ot_hours),
        ot_rate: numberValue(payrollForm.ot_rate),
        ot_pay: numberValue(payrollForm.ot_pay),
        claim_amount: numberValue(payrollForm.claim_amount),
        leave_deduction: numberValue(payrollForm.leave_deduction),
        unpaid_leave_days: numberValue(payrollForm.unpaid_leave_days),
        epf_employee: numberValue(payrollForm.epf_employee),
        epf_employer: numberValue(payrollForm.epf_employer),
        socso_employee: numberValue(payrollForm.socso_employee),
        socso_employer: numberValue(payrollForm.socso_employer),
        eis_employee: numberValue(payrollForm.eis_employee),
        eis_employer: numberValue(payrollForm.eis_employer),
        pcb: numberValue(payrollForm.pcb),
        net_pay: numberValue(payrollForm.net_pay),
        status: payrollForm.status,
        remarks: payrollForm.remarks,
      };

      const res = await fetch('/api/payroll', {
        method: payrollForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save payroll record.');
      }

      setShowForm(false);
      await fetchAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save record.');
    } finally {
      setActionLoading(false);
    }
  };

  const createBatch = async () => {
    if (!isAdmin) return;

    setActionLoading(true);

    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_batch',
          period: selectedPeriod,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create batch.');
      }

      await fetchAll();
      alert(`Payroll batch ${selectedPeriod} is ready.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create batch.');
    } finally {
      setActionLoading(false);
    }
  };

  const generateFromSources = async () => {
    if (!isAdmin || !profile) return;

    const confirmed = window.confirm(
      `Generate payroll for ${selectedPeriod} from Attendance OT and Leave deductions?\n\nThis will create/update payroll records for active employees.`
    );

    if (!confirmed) return;

    setActionLoading(true);

    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_from_sources',
          period: selectedPeriod,
          generated_by: profile.name ?? profile.email ?? 'Admin',
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate payroll.');
      }

      await fetchAll();

      alert(
        `Payroll generated from Attendance/Leave.\n\nCreated: ${
          data.created
        }\nUpdated: ${data.updated}\nSkipped: ${data.skipped}${
          data.errors?.length ? `\n\nNotes:\n${data.errors.join('\n')}` : ''
        }`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate payroll.');
    } finally {
      setActionLoading(false);
    }
  };

  const approveBatch = async () => {
    if (!isAdmin || !profile) return;

    const confirmed = window.confirm(`Approve payroll batch ${selectedPeriod}?`);

    if (!confirmed) return;

    setActionLoading(true);

    try {
      const res = await fetch('/api/payroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_batch',
          period: selectedPeriod,
          approved_by: profile.name ?? profile.email ?? 'Admin',
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to approve batch.');
      }

      await fetchAll();
      alert(`Payroll batch ${selectedPeriod} approved.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve batch.');
    } finally {
      setActionLoading(false);
    }
  };

  const releaseBatch = async () => {
    if (!isAdmin || !profile) return;

    const confirmed = window.confirm(
      `Release all payslips for ${selectedPeriod} to employees?`
    );

    if (!confirmed) return;

    setActionLoading(true);

    try {
      const res = await fetch('/api/payroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'release_batch',
          period: selectedPeriod,
          released_by: profile.name ?? profile.email ?? 'Admin',
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to release payslips.');
      }

      await fetchAll();
      alert(`Payslips for ${selectedPeriod} released.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to release payslips.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleImportCsv = async (file: File | null) => {
    if (!isAdmin || !file) return;

    setActionLoading(true);

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (!rows.length) {
        throw new Error('CSV file has no rows.');
      }

      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_records',
          period: selectedPeriod,
          rows,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to import payroll CSV.');
      }

      await fetchAll();

      alert(
        `Import complete.\nInserted: ${data.inserted}\nUpdated: ${
          data.updated
        }\nSkipped: ${data.skipped}${
          data.errors?.length ? `\n\nErrors:\n${data.errors.join('\n')}` : ''
        }`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import CSV.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState label="Crunching payroll numbers…" />;

  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle={
          isAdmin
            ? 'Organization-wide compensation overview.'
            : isManagerOnly
              ? `Compensation overview for ${
                  profile?.department ?? 'your department'
                }.`
              : 'Your released payslip history.'
        }
        action={
          isAdminOrManager ? (
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={visible.length === 0}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <Download size={16} />
              Export CSV
            </button>
          ) : undefined
        }
      />

      <div className="glass rounded-2xl p-5 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted mb-1">Payroll Period</p>
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              selectedBatch?.status === 'released'
                ? 'success'
                : selectedBatch?.status === 'approved'
                  ? 'info'
                  : 'warning'
            }
          >
            Batch: {selectedBatch?.status ?? 'not created'}
          </Badge>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={createBatch}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition-all"
              >
                <Plus size={16} />
                Create Batch
              </button>

              <button
                type="button"
                onClick={generateFromSources}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition-all"
              >
                <FileText size={16} />
                Generate Payroll
              </button>

              <button
                type="button"
                onClick={openCreateForm}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition-all"
              >
                <Pencil size={16} />
                Add Record
              </button>

              <label className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition-all cursor-pointer">
                <Upload size={16} />
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    handleImportCsv(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
              </label>

              <button
                type="button"
                onClick={approveBatch}
                disabled={actionLoading || visible.length === 0}
                className="flex items-center gap-2 rounded-xl bg-accent/15 text-accent border border-accent/25 px-4 py-2.5 text-sm font-semibold hover:bg-accent/25 disabled:opacity-50 transition-all"
              >
                <CheckCircle2 size={16} />
                Approve
              </button>

              <button
                type="button"
                onClick={releaseBatch}
                disabled={actionLoading || visible.length === 0}
                className="flex items-center gap-2 rounded-xl bg-emerald/15 text-emerald border border-emerald/25 px-4 py-2.5 text-sm font-semibold hover:bg-emerald/25 disabled:opacity-50 transition-all"
              >
                <Rocket size={16} />
                Release Payslips
              </button>
            </>
          )}
        </div>
      </div>

      {isAdminOrManager && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-5 mb-8">
          {[
            {
              label: isAdmin ? 'Total Gross Pay' : 'Department Gross Pay',
              value: money(totalGross),
              icon: Wallet,
              grad: 'from-violet-500 to-fuchsia-500',
            },
            {
              label: 'Total Net Pay',
              value: money(totalNet),
              icon: TrendingUp,
              grad: 'from-cyan-400 to-blue-500',
            },
            {
              label: 'OT Pay',
              value: money(totalOt),
              icon: FileText,
              grad: 'from-amber-400 to-orange-500',
            },
            {
              label: 'Claims',
              value: money(totalClaims),
              icon: Wallet,
              grad: 'from-emerald-400 to-teal-500',
            },
          ].map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <div className="glass rounded-2xl p-5">
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.grad} grid place-items-center shadow-lg mb-4`}
                  >
                    <Icon size={20} className="text-white" />
                  </div>

                  <div className="font-display text-xl font-bold">
                    {card.value}
                  </div>

                  <div className="text-xs text-muted mt-1">
                    {card.label}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className={
            isAdminOrManager
              ? 'xl:col-span-2 glass rounded-2xl overflow-hidden'
              : 'xl:col-span-3 glass rounded-2xl overflow-hidden'
          }
        >
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-display font-semibold">
              {isAdmin
                ? 'Payslip Records'
                : isManagerOnly
                  ? `${profile?.department ?? 'Department'} Payslip Records`
                  : 'Your Released Payslips'}
            </h3>

            <span className="text-xs text-muted">
              Released/Paid: {paidOrReleased}/{visible.length}
            </span>
          </div>

          {visible.length === 0 ? (
            <EmptyState label="No payroll records for this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                    {isAdminOrManager && (
                      <th className="px-6 py-3 font-medium">Employee</th>
                    )}

                    {isAdminOrManager && (
                      <th className="px-6 py-3 font-medium">Department</th>
                    )}

                    <th className="px-6 py-3 font-medium">Period</th>
                    <th className="px-6 py-3 font-medium">Base</th>
                    <th className="px-6 py-3 font-medium">Gross</th>
                    <th className="px-6 py-3 font-medium">OT</th>
                    <th className="px-6 py-3 font-medium">Claims</th>
                    <th className="px-6 py-3 font-medium">Net Pay</th>
                    <th className="px-6 py-3 font-medium">Status</th>

                    {isAdminOrManager && (
                      <th className="px-6 py-3 font-medium" />
                    )}
                  </tr>
                </thead>

                <tbody>
                  {visible.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all"
                    >
                      {isAdminOrManager && (
                        <td className="px-6 py-3">
                          {empMap[record.employee_id]?.name ??
                            `#${record.employee_id}`}
                        </td>
                      )}

                      {isAdminOrManager && (
                        <td className="px-6 py-3 text-muted">
                          {empMap[record.employee_id]?.department ?? '—'}
                        </td>
                      )}

                      <td className="px-6 py-3 text-muted">{record.period}</td>

                      <td className="px-6 py-3 text-muted">
                        {money(record.base_salary)}
                      </td>

                      <td className="px-6 py-3 text-muted">
                        {money(record.gross_pay)}
                      </td>

                      <td className="px-6 py-3 text-amber">
                        {money(record.ot_pay)}
                      </td>

                      <td className="px-6 py-3 text-emerald">
                        {money(record.claim_amount)}
                      </td>

                      <td className="px-6 py-3 font-semibold">
                        {money(record.net_pay)}
                      </td>

                      <td className="px-6 py-3">
                        <Badge
                          tone={
                            record.status === 'released' ||
                            record.status === 'paid'
                              ? 'success'
                              : record.status === 'approved'
                                ? 'info'
                                : 'warning'
                          }
                        >
                          {record.status}
                        </Badge>
                      </td>

                      {isAdminOrManager && (
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => openEditForm(record)}
                                className="text-muted hover:text-primary transition-all"
                                title="Edit payroll"
                              >
                                <Pencil size={15} />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                handleExportSinglePayslip(record)
                              }
                              className="text-muted hover:text-primary transition-all"
                              title="Download payslip CSV"
                            >
                              <Download size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {isAdminOrManager && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-6"
          >
            <h3 className="font-display font-semibold mb-1">
              {isAdmin ? 'Department Cost Split' : 'Payroll Cost Split'}
            </h3>

            <p className="text-xs text-muted mb-2">
              {isAdmin
                ? 'Payroll allocation by department'
                : `Payroll allocation for ${
                    profile?.department ?? 'your department'
                  }`}
            </p>

            {deptSplit.length === 0 ? (
              <EmptyState label="No payroll data available." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={deptSplit}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {deptSplit.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                          stroke="none"
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      contentStyle={{
                        background: '#12131f',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v) => money(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-1.5 mt-2">
                  {deptSplit.map((department, i) => (
                    <div
                      key={department.name}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-1.5 text-muted truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />

                        {department.name}
                      </div>

                      <span>{money(department.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showForm && isAdmin && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowForm(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="glass-solid rounded-2xl p-6 w-full max-w-3xl pointer-events-auto max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">
                    {payrollForm.id
                      ? 'Edit Payroll Record'
                      : 'Add Payroll Record'}
                  </h3>

                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-muted hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={savePayrollRecord} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      required
                      value={payrollForm.employee_id}
                      onChange={(e) =>
                        updatePayrollForm('employee_id', e.target.value)
                      }
                      className="bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    >
                      <option value="">Select employee</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name} · {employee.department ?? '—'}
                        </option>
                      ))}
                    </select>

                    <input
                      required
                      type="month"
                      value={payrollForm.period}
                      onChange={(e) =>
                        updatePayrollForm('period', e.target.value)
                      }
                      className="bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    />

                    <select
                      value={payrollForm.status}
                      onChange={(e) =>
                        updatePayrollForm('status', e.target.value)
                      }
                      className="bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    >
                      {PAYROLL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {PAYROLL_NUMBER_FIELDS.map(([key, label]) => (
                      <div key={key}>
                        <label className="text-xs text-muted mb-1 block">
                          {label}
                        </label>

                        <input
                          type="number"
                          step="0.01"
                          value={payrollForm[key]}
                          onChange={(e) =>
                            updatePayrollForm(key, e.target.value)
                          }
                          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Gross Pay
                      </label>

                      <input
                        readOnly
                        value={payrollForm.gross_pay}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none text-muted"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Net Pay
                      </label>

                      <input
                        readOnly
                        value={payrollForm.net_pay}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none text-muted"
                      />
                    </div>
                  </div>

                  <textarea
                    placeholder="Remarks"
                    value={payrollForm.remarks}
                    onChange={(e) =>
                      updatePayrollForm('remarks', e.target.value)
                    }
                    rows={3}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 resize-none"
                  />

                  {formError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {actionLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Save size={16} />
                        Save Payroll
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}