// Pure employee helpers extracted from api/employees.js so they can be
// unit-tested without a database or email transport.

import crypto from 'crypto';

export function cleanString(value) {
  return String(value ?? '').trim();
}

export function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const all = upper + lower + numbers;
  const pick = (charset) => charset[Math.floor(Math.random() * charset.length)];
  const bytes = crypto.randomBytes(9);
  let password = pick(upper) + pick(lower) + pick(numbers);

  for (let i = 0; i < 9; i += 1) {
    password += all[bytes[i] % all.length];
  }

  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

export const EVALUATION_CATEGORIES = ['worker', 'employee', 'manager'];

export function publicEmployee(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    name: row.name ?? '',
    email: row.email ?? '',
    role: row.role ?? 'employee',
    category: row.category ?? 'employee',
    department: row.department ?? null,
    title: row.title ?? null,
    status: row.status ?? 'active',
    phone: row.phone ?? null,
    location: row.location ?? null,
    join_date: row.join_date ?? null,
    employee_no: row.employee_no ?? null,
  };
}

export function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

export function friendlyDatabaseError(error, fallback = 'Unable to save. Please check the details and try again.') {
  const message = String(error?.message || error || '');

  if (message.toLowerCase().includes('duplicate') || message.includes('23505')) {
    return 'Duplicate record found. Please check existing data before saving.';
  }

  if (message.toLowerCase().includes('violates foreign key')) {
    return 'Related record was not found. Please refresh and try again.';
  }

  return message || fallback;
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export function toNullableInteger(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);

  return Number.isInteger(number) ? number : null;
}

export function normalizeIdentityLast4(value, type) {
  const raw = cleanString(value);

  if (type === 'IC') {
    return raw.replace(/\D/g, '').slice(0, 4);
  }

  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
}

export function pickProfileUpdateData(data = {}) {
  const allowed = [
    'phone',
    'address',
    'bank_name',
    'bank_account_no',
    'epf_no',
    'socso_no',
    'income_tax_no',
    'emergency_contact_name',
    'emergency_contact_relationship',
    'emergency_contact_phone',
    'marital_status',
    'number_of_children',
  ];

  const result = {};

  allowed.forEach((key) => {
    if (data[key] !== undefined) {
      result[key] =
        key === 'number_of_children'
          ? toNullableInteger(data[key]) || 0
          : cleanString(data[key]) || null;
    }
  });

  return result;
}

export function buildEmployeePayload(body, { partial = false } = {}) {
  const payload = {};

  const assign = (key, value) => {
    if (partial) {
      if (value !== undefined) payload[key] = value;
    } else {
      payload[key] = value;
    }
  };

  assign('name', body.name ? cleanString(body.name) : partial ? undefined : '');
  assign('email', body.email ? normalizeEmail(body.email) : partial ? undefined : '');
  assign('title', body.title ? cleanString(body.title) : partial ? undefined : null);
  assign(
    'department',
    body.department ? cleanString(body.department) : partial ? undefined : null
  );
  assign('phone', body.phone ? cleanString(body.phone) : partial ? undefined : null);
  assign(
    'location',
    body.location ? cleanString(body.location) : partial ? undefined : null
  );
  assign('role', body.role ? cleanString(body.role) : partial ? undefined : 'employee');

  if (body.category !== undefined || !partial) {
    const category = cleanString(body.category).toLowerCase();
    assign('category', EVALUATION_CATEGORIES.includes(category) ? category : 'employee');
  }

  if (body.employee_no !== undefined || !partial) {
    const employeeNo = cleanString(body.employee_no);
    assign('employee_no', employeeNo || null);
  }

  assign(
    'status',
    body.status ? cleanString(body.status) : partial ? undefined : 'active'
  );
  assign(
    'join_date',
    body.join_date
      ? cleanString(body.join_date)
      : partial
        ? undefined
        : new Date().toISOString().slice(0, 10)
  );

  if (body.salary !== undefined || !partial) {
    assign('salary', toNullableNumber(body.salary));
  }

  assign(
    'date_of_birth',
    body.date_of_birth
      ? cleanString(body.date_of_birth)
      : partial
        ? undefined
        : null
  );

  assign(
    'identity_type',
    body.identity_type ? cleanString(body.identity_type) : partial ? undefined : null
  );

  if (body.identity_last4 !== undefined || !partial) {
    const identityType = body.identity_type ? cleanString(body.identity_type) : 'IC';

    assign(
      'identity_last4',
      body.identity_last4
        ? normalizeIdentityLast4(body.identity_last4, identityType)
        : partial
          ? undefined
          : null
    );
  }

  const extraTextFields = [
    'bank_name',
    'bank_account_no',
    'epf_no',
    'socso_no',
    'income_tax_no',
    'address',
    'emergency_contact_name',
    'emergency_contact_relationship',
    'emergency_contact_phone',
    'marital_status',
  ];

  extraTextFields.forEach((field) => {
    assign(field, body[field] ? cleanString(body[field]) : partial ? undefined : null);
  });

  if (body.number_of_children !== undefined || !partial) {
    assign('number_of_children', toNullableInteger(body.number_of_children) ?? 0);
  }

  if (body.supervisor_id !== undefined || !partial) {
    assign('supervisor_id', toNullableNumber(body.supervisor_id));
  }

  const dateFields = [
    'probation_end_date',
    'contract_end_date',
    'work_permit_expiry',
    'passport_expiry',
    'driving_license_expiry',
    'medical_checkup_expiry',
  ];

  dateFields.forEach((field) => {
    assign(field, body[field] ? cleanString(body[field]) : partial ? undefined : null);
  });

  return payload;
}

export function getPeriodRange(period) {
  const [yearRaw, monthRaw] = String(period || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!year || !month) {
    const now = new Date();
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return getPeriodRange(fallback);
  }

  const end = new Date(Date.UTC(year, month, 0));
  const daysInMonth = end.getUTCDate();

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

export const DEFAULT_ADMIN_CONFIG = {
  document_required_types: ['IC Copy', 'Offer Letter', 'Employment Contract'],
  profile_required_fields: [
    'bank_account_no',
    'epf_no',
    'socso_no',
    'income_tax_no',
    'emergency_contact_phone',
  ],
  expiry_alert_days: 90,
  master_departments: [
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
  ],
  master_locations: ['Factory 1', 'Factory 2', 'Factory 3', 'Factory 4'],
  announcement_categories: ['General', 'HR', 'Payroll', 'Holiday', 'Safety', 'Policy'],
  performance_review_types: [
    'Annual Review',
    'Probation Review',
    'Promotion Review',
    'Performance Improvement',
  ],
};

export function sanitizeTemplateSections(sections) {
  if (!Array.isArray(sections)) return [];

  return sections
    .map((section) => {
      if (!section || !cleanString(section.name)) return null;

      const criteria = Array.isArray(section.criteria)
        ? section.criteria
            .map((criterion) => {
              if (!criterion || !cleanString(criterion.name)) return null;

              const maxScore = Math.max(0, toNullableNumber(criterion.max_score) || 0);
              if (maxScore <= 0) return null;

              return {
                id: cleanString(criterion.id) || crypto.randomUUID(),
                name: cleanString(criterion.name),
                max_score: maxScore,
                description: cleanString(criterion.description) || null,
              };
            })
            .filter(Boolean)
        : [];

      if (!criteria.length) return null;

      return {
        id: cleanString(section.id) || crypto.randomUUID(),
        name: cleanString(section.name),
        criteria,
      };
    })
    .filter(Boolean);
}

export function templateCriteriaSections(sections) {
  return (sections || []).flatMap((section) => {
    if (!section || !Array.isArray(section.criteria)) return [];
    return section.criteria;
  });
}

export function sanitizeEvaluationScores(scores, sections) {
  const result = {};
  const allCriteria = templateCriteriaSections(sections);

  allCriteria.forEach((criterion) => {
    const row = scores && typeof scores === 'object' ? scores[criterion.id] : null;

    if (row && typeof row === 'object') {
      const rawScore = Number(row.score);
      const score = Number.isFinite(rawScore)
        ? Math.min(Math.max(rawScore, 0), Number(criterion.max_score || 0))
        : 0;

      result[criterion.id] = {
        score,
        comment: cleanString(row.comment) || null,
      };
    } else {
      result[criterion.id] = { score: 0, comment: null };
    }
  });

  return result;
}

export function computeOverallScore(scores, sections) {
  const allCriteria = templateCriteriaSections(sections);
  const totalMax = allCriteria.reduce(
    (sum, criterion) => sum + Number(criterion.max_score || 0),
    0
  );

  if (!totalMax) return 0;

  const total = allCriteria.reduce(
    (sum, criterion) => sum + Number(scores?.[criterion.id]?.score || 0),
    0
  );

  return Math.round((total / totalMax) * 100);
}

export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || 'https://hr-system2.vercel.app').replace(/\/+$/, '');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildReminderEmail(results = []) {
  const appUrl = getAppBaseUrl();
  const rows = results
    .slice(0, 80)
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.reminder_type)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.employee_name || 'General')}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.title)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.message)}</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 8px;color:#1f4fa3;">WtecHR Reminder Summary</h2>
      <p style="margin:0 0 16px;color:#4b5563;">${results.length} reminder(s) generated.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:8px;">Type</th>
            <th style="padding:8px;">Employee</th>
            <th style="padding:8px;">Title</th>
            <th style="padding:8px;">Message</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:12px;">No reminders.</td></tr>'}</tbody>
      </table>
      <p style="margin-top:18px;">
        <a href="${appUrl}/admin-config" style="background:#1f4fa3;color:white;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;">Open Admin Config</a>
      </p>
      <p style="font-size:12px;color:#6b7280;margin-top:18px;">This email was generated automatically by WtecHR.</p>
    </div>`;

  const text = [
    `WtecHR Reminder Summary`,
    `${results.length} reminder(s) generated.`,
    '',
    ...results.slice(0, 80).map((item) => `- [${item.reminder_type}] ${item.employee_name || 'General'}: ${item.title} - ${item.message}`),
    '',
    `${appUrl}/admin-config`,
  ].join('\n');

  return { html, text };
}

export function daysUntilDate(dateValue) {
  if (!dateValue) return null;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}