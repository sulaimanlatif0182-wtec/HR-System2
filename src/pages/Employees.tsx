import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  Search,
  LayoutGrid,
  List,
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  DollarSign,
  Loader2,
  Download,
  UserX,
  IdCard,
  Pencil,
  Save,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader,
  Badge,
  GlowCard,
  LoadingState,
  ErrorState,
  EmptyState,
  InfoRow,
} from '../components/ui';

const STATUS_TONE: Record<string, string> = {
  active: 'success',
  on_leave: 'warning',
  inactive: 'default',
};

const DEPARTMENT_OPTIONS = [
  'Engineering',
  'QA',
  'Managing Director',
  'Sales',
  'Human Resource',
  'Finance',
  'Executive Director',
  'Administration',
  'Shipping',
  'Maintenance',
  'QC',
  'Store',
  'Planner',
  'IT',
  'Purchasing',
  'Marketing',
];

const LOCATION_OPTIONS = [
  'Factory 1',
  'Factory 2',
  'Factory 3',
  'Factory 4',
];

const ROLE_OPTIONS = [
  {
    label: 'Employee',
    value: 'employee',
  },
  {
    label: 'Manager',
    value: 'manager',
  },
  {
    label: 'Admin',
    value: 'admin',
  },
] as const;

const STATUS_OPTIONS = ['active', 'on_leave', 'inactive'] as const;

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function normalizeIdentityLast4(value: string, type: string) {
  if (type === 'IC') {
    return value.replace(/\D/g, '').slice(0, 4);
  }

  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
}

interface Employee {
  id: number;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  status: string;
  phone: string | null;
  location: string | null;
  join_date: string | null;
  role: string;
  salary: number | null;
  date_of_birth?: string | null;
  identity_type?: string | null;
  identity_last4?: string | null;
}

interface EmployeeFormState {
  name: string;
  email: string;
  role: string;
  title: string;
  department: string;
  phone: string;
  location: string;
  date_of_birth: string;
  identity_type: string;
  identity_last4: string;
  salary: string;
  status: string;
}

function emptyForm(): EmployeeFormState {
  return {
    name: '',
    email: '',
    role: 'employee',
    title: '',
    department: '',
    phone: '',
    location: '',
    date_of_birth: '',
    identity_type: 'IC',
    identity_last4: '',
    salary: '',
    status: 'active',
  };
}

function formFromEmployee(employee: Employee): EmployeeFormState {
  return {
    name: employee.name ?? '',
    email: employee.email ?? '',
    role: employee.role ?? 'employee',
    title: employee.title ?? '',
    department: employee.department ?? '',
    phone: employee.phone ?? '',
    location: employee.location ?? '',
    date_of_birth: employee.date_of_birth ?? '',
    identity_type: employee.identity_type ?? 'IC',
    identity_last4: employee.identity_last4 ?? '',
    salary: employee.salary !== null && employee.salary !== undefined ? String(employee.salary) : '',
    status: employee.status ?? 'active',
  };
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

export default function Employees() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isManagerOnly = profile?.role === 'manager';
  const isAdminOrManager =
    profile?.role === 'admin' || profile?.role === 'manager';

  const profileDepartment = String(profile?.department ?? '')
    .trim()
    .toLowerCase();

  const availableRoleOptions = isAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((role) => role.value === 'employee');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [deptFilter, setDeptFilter] = useState('all');
  const [selected, setSelected] = useState<Employee | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [form, setForm] = useState<EmployeeFormState>(emptyForm());
  const [editForm, setEditForm] = useState<EmployeeFormState>(emptyForm());

  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [formError, setFormError] = useState('');
  const [editError, setEditError] = useState('');

  const [tab, setTab] = useState<'info' | 'documents' | 'performance'>('info');

  useEffect(() => {
    const q = searchParams.get('q');

    if (q !== null) {
      setSearch(q);
    }
  }, [searchParams]);

  const fetchEmployees = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await (await fetch('/api/employees')).json();

      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load employees.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

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

  const departments = useMemo(() => {
    const set = new Set(
      visibleEmployees.map((e) => e.department).filter(Boolean) as string[]
    );

    return ['all', ...Array.from(set)];
  }, [visibleEmployees]);

  const filtered = useMemo(
    () =>
      visibleEmployees.filter((e) => {
        const s = search.toLowerCase();

        const matchesSearch =
          e.name.toLowerCase().includes(s) ||
          e.email.toLowerCase().includes(s) ||
          (e.role ?? '').toLowerCase().includes(s) ||
          (e.title ?? '').toLowerCase().includes(s) ||
          (e.department ?? '').toLowerCase().includes(s) ||
          (e.location ?? '').toLowerCase().includes(s);

        const matchesDept = deptFilter === 'all' || e.department === deptFilter;

        return matchesSearch && matchesDept;
      }),
    [visibleEmployees, search, deptFilter]
  );

  const effectiveDepartment: string = isAdmin
    ? form.department
    : profile?.department ?? '';

  const addDepartmentOptions = useMemo(() => {
    if (isAdmin) {
      return DEPARTMENT_OPTIONS;
    }

    return profile?.department ? [profile.department] : [];
  }, [isAdmin, profile?.department]);

  const handleOpenAdd = () => {
    setForm({
      ...emptyForm(),
      department: isAdmin ? '' : profile?.department ?? '',
    });

    setFormError('');
    setShowAdd(true);
  };

  const handleOpenEdit = (employee: Employee) => {
    if (!isAdmin) return;

    setEditForm(formFromEmployee(employee));
    setEditError('');
    setShowEdit(true);
  };

  const handleExportCsv = () => {
    const rows = filtered.map((emp) => ({
      ID: emp.id,
      Name: emp.name,
      Email: emp.email,
      Role: emp.role,
      Title: emp.title ?? '',
      Department: emp.department ?? '',
      Status: emp.status,
      Phone: emp.phone ?? '',
      Location: emp.location ?? '',
      Join_Date: emp.join_date ?? '',
      Salary: emp.salary ?? '',
      Date_Of_Birth: emp.date_of_birth ?? '',
      Identity_Type: emp.identity_type ?? '',
      Identity_Last4: emp.identity_last4 ?? '',
    }));

    downloadCsv('employees.csv', rows);
  };

  const validateEmployeeForm = (
    values: EmployeeFormState,
    department: string,
    mode: 'add' | 'edit'
  ) => {
    if (
      !values.name ||
      !values.email ||
      !values.role ||
      !department ||
      !values.location ||
      !values.date_of_birth ||
      !values.identity_last4
    ) {
      return 'Name, email, role, department, location, birthday and identity last 4 digits are required.';
    }

    if (values.identity_last4.length !== 4) {
      return 'Identity last 4 must be exactly 4 characters.';
    }

    if (mode === 'edit' && !values.status) {
      return 'Status is required.';
    }

    return '';
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();

    const validationError = validateEmployeeForm(
      form,
      effectiveDepartment,
      'add'
    );

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          role: isAdmin ? form.role : 'employee',
          department: effectiveDepartment,
          salary: form.salary ? Number(form.salary) : null,
          date_of_birth: form.date_of_birth,
          identity_type: form.identity_type,
          identity_last4: form.identity_last4,
          status: 'active',
          join_date: new Date().toISOString().slice(0, 10),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to add employee');
      }

      setShowAdd(false);
      setForm(emptyForm());
      fetchEmployees();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();

    if (!selected || !isAdmin) return;

    const validationError = validateEmployeeForm(
      editForm,
      editForm.department,
      'edit'
    );

    if (validationError) {
      setEditError(validationError);
      return;
    }

    if (selected.id === profile?.id && editForm.status === 'inactive') {
      setEditError('You cannot set your own admin profile to inactive.');
      return;
    }

    setSavingEdit(true);
    setEditError('');

    try {
      const res = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          ...editForm,
          salary: editForm.salary ? Number(editForm.salary) : null,
          date_of_birth: editForm.date_of_birth,
          identity_type: editForm.identity_type,
          identity_last4: editForm.identity_last4,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update employee.');
      }

      const updatedEmployee = data?.employee;

      if (updatedEmployee) {
        setEmployees((prev) =>
          prev.map((employee) =>
            employee.id === updatedEmployee.id ? updatedEmployee : employee
          )
        );

        setSelected(updatedEmployee);
      } else {
        await fetchEmployees();
      }

      setShowEdit(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update employee.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeactivateEmployee = async (employee: Employee) => {
    if (!isAdmin) return;

    if (employee.id === profile?.id) {
      alert('You cannot deactivate your own admin profile.');
      return;
    }

    if (employee.status === 'inactive') {
      alert(`${employee.name} is already inactive.`);
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to deactivate ${employee.name}? Their attendance, leave, and payroll history will be kept.`
    );

    if (!confirmed) return;

    setDeactivating(true);

    try {
      const res = await fetch(`/api/employees?id=${employee.id}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to deactivate employee.');
      }

      const updatedEmployee = data?.employee;

      if (updatedEmployee) {
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === employee.id
              ? {
                  ...e,
                  status: updatedEmployee.status,
                }
              : e
          )
        );

        setSelected((prev) =>
          prev
            ? {
                ...prev,
                status: updatedEmployee.status,
              }
            : prev
        );
      } else {
        await fetchEmployees();
      }

      alert(`${employee.name} has been deactivated.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate employee.');
    } finally {
      setDeactivating(false);
    }
  };

  const updateFormIdentityType = (identityType: string) => {
    setForm({
      ...form,
      identity_type: identityType,
      identity_last4: normalizeIdentityLast4(form.identity_last4, identityType),
    });
  };

  const updateEditIdentityType = (identityType: string) => {
    setEditForm({
      ...editForm,
      identity_type: identityType,
      identity_last4: normalizeIdentityLast4(
        editForm.identity_last4,
        identityType
      ),
    });
  };

  const renderEmployeeFormFields = (
    values: EmployeeFormState,
    setValues: (next: EmployeeFormState) => void,
    mode: 'add' | 'edit'
  ) => {
    const departmentValue = mode === 'add' ? effectiveDepartment : values.department;
    const departmentOptions =
      mode === 'add' ? addDepartmentOptions : DEPARTMENT_OPTIONS;

    return (
      <>
        <input
          required
          placeholder="Full name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
        />

        <input
          required
          type="email"
          placeholder="Email"
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
        />

        <select
          required
          value={values.role}
          onChange={(e) => setValues({ ...values, role: e.target.value })}
          disabled={!isAdmin}
          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 text-ink disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {availableRoleOptions.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>

        {mode === 'edit' && (
          <select
            required
            value={values.status}
            onChange={(e) => setValues({ ...values, status: e.target.value })}
            className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 text-ink"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </select>
        )}

        <input
          placeholder="Job title"
          value={values.title}
          onChange={(e) => setValues({ ...values, title: e.target.value })}
          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
        />

        <select
          required
          value={departmentValue || ''}
          onChange={(e) => setValues({ ...values, department: e.target.value })}
          disabled={mode === 'add' && !isAdmin}
          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 text-ink disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="" disabled>
            Select Department
          </option>

          {departmentOptions.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>

        {values.role === 'manager' && departmentValue && (
          <p className="text-xs text-amber bg-amber/10 border border-amber/20 rounded-lg px-3 py-2">
            This user will be assigned as Manager for {departmentValue}.
          </p>
        )}

        {values.role === 'admin' && (
          <p className="text-xs text-rose bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
            This user will have full admin access.
          </p>
        )}

        {mode === 'add' && !isAdmin && profile?.department && (
          <p className="text-xs text-muted bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
            As a manager, you can only add employees to your department:{' '}
            <span className="text-ink font-medium">{profile.department}</span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted mb-1 block">
              Birthday
            </label>

            <input
              required
              type="date"
              value={values.date_of_birth}
              onChange={(e) =>
                setValues({ ...values, date_of_birth: e.target.value })
              }
              className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">
              Identity Type
            </label>

            <select
              required
              value={values.identity_type}
              onChange={(e) =>
                mode === 'add'
                  ? updateFormIdentityType(e.target.value)
                  : updateEditIdentityType(e.target.value)
              }
              className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 text-ink"
            >
              <option value="IC">Malaysian IC</option>
              <option value="Passport">Passport</option>
            </select>
          </div>
        </div>

        <input
          required
          maxLength={4}
          placeholder="Last 4 digits/chars of IC or passport"
          value={values.identity_last4}
          onChange={(e) =>
            setValues({
              ...values,
              identity_last4: normalizeIdentityLast4(
                e.target.value,
                values.identity_type
              ),
            })
          }
          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
        />

        <input
          type="number"
          step="0.01"
          placeholder="Monthly salary"
          value={values.salary}
          onChange={(e) => setValues({ ...values, salary: e.target.value })}
          className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
        />

        <p className="text-xs text-muted bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
          Payslip PDF password will be birthday YYMMDD + last 4 digits/chars.
          Example: 9508201234
        </p>

        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Phone"
            value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })}
            className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
          />

          <select
            required
            value={values.location}
            onChange={(e) => setValues({ ...values, location: e.target.value })}
            className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 text-ink"
          >
            <option value="" disabled>
              Select Location
            </option>

            {LOCATION_OPTIONS.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
      </>
    );
  };

  if (loading) return <LoadingState label="Loading employee directory…" />;
  if (error) return <ErrorState message={error} onRetry={fetchEmployees} />;

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        subtitle={`${visibleEmployees.length} visible people across ${
          departments.length - 1
        } departments`}
        action={
          isAdminOrManager ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filtered.length === 0}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              >
                <Download size={16} />
                Export CSV
              </button>

              <button
                type="button"
                onClick={handleOpenAdd}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] transition-all"
              >
                <UserPlus size={16} />
                Add Employee
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, role, title…"
            className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-all"
        >
          {departments.map((d) => (
            <option key={d} value={d}>
              {d === 'all' ? 'All Departments' : d}
            </option>
          ))}
        </select>

        <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={`p-2 rounded-lg transition-all ${
              view === 'grid' ? 'bg-primary/20 text-primary' : 'text-muted'
            }`}
          >
            <LayoutGrid size={16} />
          </button>

          <button
            type="button"
            onClick={() => setView('table')}
            className={`p-2 rounded-lg transition-all ${
              view === 'table' ? 'bg-primary/20 text-primary' : 'text-muted'
            }`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label="No employees match your filters." />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((emp, i) => (
            <motion.div
              key={emp.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: Math.min(i * 0.04, 0.4),
              }}
            >
              <GlowCard className="p-5 cursor-pointer h-full">
                <div
                  onClick={() => {
                    setSelected(emp);
                    setTab('info');
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center font-bold shrink-0">
                      {initials(emp.name)}
                    </div>

                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {emp.name}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {emp.title}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        emp.role === 'admin'
                          ? 'danger'
                          : emp.role === 'manager'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {emp.role}
                    </Badge>

                    <Badge tone="info">{emp.department}</Badge>

                    <Badge tone={STATUS_TONE[emp.status] ?? 'default'}>
                      {emp.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                <th className="px-5 py-3.5 font-medium">Employee</th>
                <th className="px-5 py-3.5 font-medium">Role</th>
                <th className="px-5 py-3.5 font-medium">Department</th>
                <th className="px-5 py-3.5 font-medium">Title</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Location</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => {
                    setSelected(emp);
                    setTab('info');
                  }}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer transition-all"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-xs font-bold shrink-0">
                        {initials(emp.name)}
                      </div>

                      <div>
                        <p className="font-medium">{emp.name}</p>
                        <p className="text-xs text-muted">{emp.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-3.5">
                    <Badge
                      tone={
                        emp.role === 'admin'
                          ? 'danger'
                          : emp.role === 'manager'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {emp.role}
                    </Badge>
                  </td>

                  <td className="px-5 py-3.5 text-muted">
                    {emp.department}
                  </td>

                  <td className="px-5 py-3.5 text-muted">
                    {emp.title}
                  </td>

                  <td className="px-5 py-3.5">
                    <Badge tone={STATUS_TONE[emp.status] ?? 'default'}>
                      {emp.status.replace('_', ' ')}
                    </Badge>
                  </td>

                  <td className="px-5 py-3.5 text-muted">
                    {emp.location}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setSelected(null)}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-screen w-full max-w-md glass-solid border-l border-white/10 z-50 overflow-y-auto scrollbar-thin"
            >
              <div className="p-6">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="ml-auto flex text-muted hover:text-ink mb-4"
                >
                  <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center text-2xl font-bold shadow-xl shadow-primary/30">
                    {initials(selected.name)}
                  </div>

                  <h2 className="font-display text-xl font-bold mt-4">
                    {selected.name}
                  </h2>

                  <p className="text-muted text-sm">{selected.title}</p>

                  <div className="flex flex-wrap justify-center gap-2 mt-3">
                    <Badge
                      tone={
                        selected.role === 'admin'
                          ? 'danger'
                          : selected.role === 'manager'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {selected.role}
                    </Badge>

                    <Badge tone="info">{selected.department}</Badge>

                    <Badge tone={STATUS_TONE[selected.status] ?? 'default'}>
                      {selected.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap justify-center gap-2 mt-5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(selected)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/10 transition-all"
                      >
                        <Pencil size={16} />
                        Edit Profile
                      </button>

                      {selected.status !== 'inactive' && (
                        <button
                          type="button"
                          onClick={() => handleDeactivateEmployee(selected)}
                          disabled={deactivating}
                          className="flex items-center justify-center gap-2 rounded-xl border border-amber/25 bg-amber/10 px-4 py-2.5 text-sm font-semibold text-amber hover:bg-amber/20 disabled:cursor-not-allowed disabled:opacity-60 transition-all"
                        >
                          {deactivating ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <UserX size={16} />
                          )}

                          Deactivate
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1 mt-6">
                  {(['info', 'documents', 'performance'] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                        tab === t
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {tab === 'info' && (
                    <>
                      <InfoRow
                        icon={Mail}
                        label="Email"
                        value={selected.email}
                      />

                      <InfoRow
                        icon={Phone}
                        label="Phone"
                        value={selected.phone ?? '—'}
                      />

                      <InfoRow
                        icon={MapPin}
                        label="Location"
                        value={selected.location ?? '—'}
                      />

                      <InfoRow
                        icon={Calendar}
                        label="Birthday"
                        value={selected.date_of_birth ?? '—'}
                      />

                      <InfoRow
                        icon={Calendar}
                        label="Joined"
                        value={selected.join_date ?? '—'}
                      />

                      <InfoRow
                        icon={Briefcase}
                        label="Role"
                        value={selected.role}
                      />

                      <InfoRow
                        icon={IdCard}
                        label="Identity"
                        value={`${selected.identity_type ?? '—'} · ${
                          selected.identity_last4
                            ? `Last 4: ${selected.identity_last4}`
                            : 'Last 4: —'
                        }`}
                      />

                      {selected.salary && (
                        <InfoRow
                          icon={DollarSign}
                          label="Monthly Salary"
                          value={`RM ${Number(
                            selected.salary
                          ).toLocaleString()}`}
                        />
                      )}
                    </>
                  )}

                  {tab === 'documents' && (
                    <div className="space-y-2">
                      {[
                        'Employment Contract.pdf',
                        'ID Verification.pdf',
                        'Tax Form W-4.pdf',
                      ].map((doc) => (
                        <div
                          key={doc}
                          className="flex items-center justify-between glass rounded-xl px-4 py-3 text-sm"
                        >
                          <span>{doc}</span>
                          <span className="text-xs text-muted">2.1 MB</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === 'performance' && (
                    <div className="space-y-3">
                      {(
                        [
                          ['Q1 Review', 92],
                          ['Q2 Review', 88],
                          ['Q3 Review', 95],
                        ] as const
                      ).map(([label, pct]) => (
                        <div key={label} className="glass rounded-xl px-4 py-3">
                          <div className="flex justify-between text-sm mb-2">
                            <span>{label}</span>
                            <span className="text-primary font-semibold">
                              {pct}%
                            </span>
                          </div>

                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8 }}
                              className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdd && isAdminOrManager && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowAdd(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="glass-solid rounded-2xl p-6 w-full max-w-md pointer-events-auto max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">
                    Add Employee
                  </h3>

                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="text-muted hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleAdd} className="space-y-3">
                  {renderEmployeeFormFields(form, setForm, 'add')}

                  {formError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold mt-2 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      'Add Employee'
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEdit && selected && isAdmin && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setShowEdit(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="glass-solid rounded-2xl p-6 w-full max-w-md pointer-events-auto max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">
                    Edit Employee
                  </h3>

                  <button
                    type="button"
                    onClick={() => setShowEdit(false)}
                    className="text-muted hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleEdit} className="space-y-3">
                  {renderEmployeeFormFields(editForm, setEditForm, 'edit')}

                  {editError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
                      {editError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold mt-2 disabled:opacity-60"
                  >
                    {savingEdit ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Save size={16} />
                        Save Changes
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