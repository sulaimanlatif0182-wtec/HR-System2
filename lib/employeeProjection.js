// Role-aware projection of employee rows to prevent PII overexposure.
//
// Any authenticated caller can hit GET /api/employees. Sensitive columns
// (salary, bank/EPF/SOCSO/tax numbers, identity, emergency contacts, etc.)
// must only be serialized for the record owner or an admin. Everyone else
// receives a safe public subset.

export const PUBLIC_EMPLOYEE_FIELDS = [
  'id',
  'name',
  'email',
  'role',
  'category',
  'department',
  'title',
  'status',
  'phone',
  'location',
  'join_date',
  'employee_no',
  'avatar_url',
];

export const SENSITIVE_EMPLOYEE_FIELDS = [
  'salary',
  'bank_name',
  'bank_account_no',
  'epf_no',
  'socso_no',
  'income_tax_no',
  'identity_type',
  'identity_last4',
  'address',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_phone',
  'marital_status',
  'number_of_children',
  'date_of_birth',
  'probation_end_date',
  'contract_end_date',
  'work_permit_expiry',
  'passport_expiry',
  'driving_license_expiry',
  'medical_checkup_expiry',
];

function canViewSensitive(row, viewer) {
  if (!viewer) return false;
  if (viewer.role === 'admin') return true;
  if (Number(viewer.id) === Number(row.id)) return true;
  return false;
}

function defaultFor(field, row) {
  if (field === 'id') return Number(row.id);
  if (field === 'role') return row.role ?? 'employee';
  if (field === 'category') return row.category ?? 'employee';
  if (field === 'status') return row.status ?? 'active';
  return row[field] ?? null;
}

export function projectEmployee(row, viewer) {
  if (!row) return null;

  const safe = {};

  for (const field of PUBLIC_EMPLOYEE_FIELDS) {
    safe[field] = defaultFor(field, row);
  }

  if (canViewSensitive(row, viewer)) {
    for (const field of SENSITIVE_EMPLOYEE_FIELDS) {
      safe[field] = row[field] ?? null;
    }
  }

  return safe;
}
