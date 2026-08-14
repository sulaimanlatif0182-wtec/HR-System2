import crypto from 'crypto';
import { supabase } from '../lib/db-client.js';
import {
  getFeatureFlags,
  isFeatureEnabled,
  saveFeatureFlag,
  saveFeatureFlags,
} from '../lib/feature-flags.js';
import { requireAuth } from '../lib/requireAuth.js';
import { assertAdmin } from '../lib/authorize.js';
import { setCors } from '../lib/cors.js';
import { projectEmployee } from '../lib/employeeProjection.js';
import { parseAccountEmail, parseProfileUpdate } from '../lib/validators.js';
import { isRateLimited } from '../lib/rateLimit.js';
import { sendNotificationEmail } from '../server/email.js';
import { handleImportEmployees, handleImportCreateAccounts } from '../lib/imports.js';

export async function safeInsertSystemAudit(payload) {
  try {
    await supabase.from('system_audit_logs').insert({
      module: payload.module || 'general',
      action: payload.action || 'unknown',
      record_id: payload.record_id || null,
      employee_id: payload.employee_id || null,
      changed_by: payload.changed_by || null,
      changed_by_name: payload.changed_by_name || null,
      old_data: payload.old_data || null,
      new_data: payload.new_data || null,
      reason: payload.reason || null,
    });
  } catch (err) {
    console.error('System audit insert failed:', err?.message || err);
  }
}

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

const EVALUATION_CATEGORIES = ['worker', 'employee', 'manager'];

function publicEmployee(row) {
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

function sanitizeTemplateSections(sections) {
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

function templateCriteriaSections(sections) {
  return (sections || []).flatMap((section) => {
    if (!section || !Array.isArray(section.criteria)) return [];
    return section.criteria;
  });
}

function sanitizeEvaluationScores(scores, sections) {
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

function computeOverallScore(scores, sections) {
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

function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || 'https://hr-system2.vercel.app').replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendSmtpEmail({ to, subject, html, text }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

  if (!recipients.length) return { sent: 0, skipped: true, reason: 'No recipients.' };

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    return {
      sent: 0,
      skipped: true,
      reason: 'SMTP env variables are not configured.',
    };
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user,
      pass,
    },
  });

  const info = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'WtecHR'}" <${process.env.SMTP_FROM || user}>`,
    to: recipients.join(','),
    subject,
    html,
    text,
  });

  return {
    sent: recipients.length,
    messageId: info.messageId,
  };
}

async function getAdminEmails() {
  const { data, error } = await supabase
    .from('employees')
    .select('email')
    .eq('role', 'admin')
    .neq('status', 'inactive');

  if (error) return [];

  return Array.from(
    new Set((data || []).map((row) => cleanString(row.email)).filter(Boolean))
  );
}

function buildReminderEmail(results = []) {
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

async function sendReminderSummaryEmail(results = []) {
  const adminEmails = await getAdminEmails();

  if (!adminEmails.length) {
    return { sent: 0, skipped: true, reason: 'No admin email recipients found.' };
  }

  const { html, text } = buildReminderEmail(results);

  return sendSmtpEmail({
    to: adminEmails,
    subject: `WtecHR Reminder Summary - ${results.length} reminder(s)`,
    html,
    text,
  });
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

export async function recordExists(table, filters = [], excludeId = null) {
  let query = supabase.from(table).select('id').limit(1);

  filters.forEach(([column, value, operator = 'eq']) => {
    if (operator === 'ilike') query = query.ilike(column, value);
    else query = query.eq(column, value);
  });

  if (excludeId) query = query.neq('id', Number(excludeId));

  const { data, error } = await query.maybeSingle();

  if (error) throw error;

  return Boolean(data);
}

function normalizeIdentityLast4(value, type) {
  const raw = cleanString(value);

  if (type === 'IC') {
    return raw.replace(/\D/g, '').slice(0, 4);
  }

  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);

  return Number.isInteger(number) ? number : null;
}

function pickProfileUpdateData(data = {}) {
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


function getPeriodRange(period) {
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

async function countRows(table, buildQuery) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (buildQuery) query = buildQuery(query);
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

async function sumRows(table, column, buildQuery) {
  let query = supabase.from(table).select(column);
  if (buildQuery) query = buildQuery(query);
  const { data, error } = await query;
  if (error) return 0;
  return (data || []).reduce((sum, row) => sum + Number(row[column] || 0), 0);
}

const DEFAULT_ADMIN_CONFIG = {
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

async function getAdminConfig() {
  const { data, error } = await supabase
    .from('admin_configurations')
    .select('key, value')
    .in('key', [
      'document_required_types',
      'profile_required_fields',
      'expiry_alert_days',
      'master_departments',
      'master_locations',
      'announcement_categories',
      'performance_review_types',
    ]);

  if (error) return DEFAULT_ADMIN_CONFIG;

  const config = { ...DEFAULT_ADMIN_CONFIG };

  (data || []).forEach((row) => {
    config[row.key] = row.value;
  });

  return {
    ...DEFAULT_ADMIN_CONFIG,
    ...config,
    document_required_types: Array.isArray(config.document_required_types)
      ? config.document_required_types
      : DEFAULT_ADMIN_CONFIG.document_required_types,
    profile_required_fields: Array.isArray(config.profile_required_fields)
      ? config.profile_required_fields
      : DEFAULT_ADMIN_CONFIG.profile_required_fields,
    expiry_alert_days: Number(config.expiry_alert_days || 90),
    master_departments: Array.isArray(config.master_departments)
      ? config.master_departments
      : DEFAULT_ADMIN_CONFIG.master_departments,
    master_locations: Array.isArray(config.master_locations)
      ? config.master_locations
      : DEFAULT_ADMIN_CONFIG.master_locations,
    announcement_categories: Array.isArray(config.announcement_categories)
      ? config.announcement_categories
      : DEFAULT_ADMIN_CONFIG.announcement_categories,
    performance_review_types: Array.isArray(config.performance_review_types)
      ? config.performance_review_types
      : DEFAULT_ADMIN_CONFIG.performance_review_types,
  };
}

async function saveAdminConfig(config, actor = {}) {
  const cleanConfig = {
    ...DEFAULT_ADMIN_CONFIG,
    ...(config || {}),
    document_required_types: Array.isArray(config?.document_required_types)
      ? config.document_required_types.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.document_required_types,
    profile_required_fields: Array.isArray(config?.profile_required_fields)
      ? config.profile_required_fields.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.profile_required_fields,
    expiry_alert_days: Number(config?.expiry_alert_days || 90),
    master_departments: Array.isArray(config?.master_departments)
      ? config.master_departments.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.master_departments,
    master_locations: Array.isArray(config?.master_locations)
      ? config.master_locations.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.master_locations,
    announcement_categories: Array.isArray(config?.announcement_categories)
      ? config.announcement_categories.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.announcement_categories,
    performance_review_types: Array.isArray(config?.performance_review_types)
      ? config.performance_review_types.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.performance_review_types,
  };

  const rows = Object.entries(cleanConfig).map(([key, value]) => ({
    key,
    value,
    updated_by: actor.changed_by || null,
    updated_by_name: actor.changed_by_name || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('admin_configurations')
    .upsert(rows, { onConflict: 'key' });

  if (error) throw error;

  return cleanConfig;
}

async function buildDocumentChecklist() {
  const config = await getAdminConfig();
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('*')
    .neq('status', 'inactive')
    .order('name', { ascending: true });

  if (empError) throw empError;

  const { data: documents, error: docError } = await supabase
    .from('employee_documents')
    .select('employee_id, document_type');

  if (docError) throw docError;

  const docMap = new Map();

  (documents || []).forEach((doc) => {
    const employeeId = Number(doc.employee_id);
    if (!docMap.has(employeeId)) docMap.set(employeeId, new Set());
    docMap.get(employeeId).add(cleanString(doc.document_type));
  });

  return (employees || []).map((employee) => {
    const ownedDocs = docMap.get(Number(employee.id)) || new Set();
    const missingDocuments = config.document_required_types.filter(
      (type) => !ownedDocs.has(type)
    );

    const missingProfileFields = config.profile_required_fields.filter((field) => {
      const value = employee[field];
      return value === null || value === undefined || String(value).trim() === '';
    });

    return {
      employee_id: employee.id,
      employee_name: employee.name,
      department: employee.department,
      missing_documents: missingDocuments,
      missing_profile_fields: missingProfileFields,
      total_missing: missingDocuments.length + missingProfileFields.length,
    };
  });
}

function daysUntilDate(dateValue) {
  if (!dateValue) return null;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

async function buildReminderResults() {
  const [rulesResult, checklist, employeeResult] = await Promise.all([
    supabase.from('reminder_rules').select('*').eq('enabled', true),
    buildDocumentChecklist(),
    supabase.from('employees').select('*').neq('status', 'inactive'),
  ]);

  if (rulesResult.error) throw rulesResult.error;
  if (employeeResult.error) throw employeeResult.error;

  const rules = rulesResult.data || [];
  const employees = employeeResult.data || [];
  const results = [];

  for (const rule of rules) {
    if (rule.reminder_type === 'expiry') {
      employees.forEach((employee) => {
        [
          ['Probation End', employee.probation_end_date],
          ['Contract End', employee.contract_end_date],
          ['Work Permit Expiry', employee.work_permit_expiry],
          ['Passport Expiry', employee.passport_expiry],
          ['Driving License Expiry', employee.driving_license_expiry],
          ['Medical Checkup Expiry', employee.medical_checkup_expiry],
        ].forEach(([label, date]) => {
          const days = daysUntilDate(date);
          if (days !== null && days <= Number(rule.days_before) && days >= -30) {
            results.push({
              rule_id: rule.id,
              reminder_type: 'expiry',
              employee_id: employee.id,
              employee_name: employee.name,
              title: `${label}: ${employee.name}`,
              message:
                days < 0
                  ? `${label} expired ${Math.abs(days)} day(s) ago on ${date}.`
                  : `${label} will expire in ${days} day(s) on ${date}.`,
            });
          }
        });
      });
    }

    if (rule.reminder_type === 'missing_documents') {
      checklist
        .filter((row) => row.missing_documents.length > 0)
        .forEach((row) => {
          results.push({
            rule_id: rule.id,
            reminder_type: 'missing_documents',
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            title: `Missing documents: ${row.employee_name}`,
            message: row.missing_documents.join(', '),
          });
        });
    }

    if (rule.reminder_type === 'missing_profile') {
      checklist
        .filter((row) => row.missing_profile_fields.length > 0)
        .forEach((row) => {
          results.push({
            rule_id: rule.id,
            reminder_type: 'missing_profile',
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            title: `Missing profile info: ${row.employee_name}`,
            message: row.missing_profile_fields.join(', '),
          });
        });
    }

    if (rule.reminder_type === 'pending_approvals') {
      const [leavePending, profilePending, correctionPending] = await Promise.all([
        countRows('leave_requests', (q) => q.eq('status', 'pending')),
        countRows('employee_profile_update_requests', (q) => q.eq('status', 'pending')),
        countRows('attendance_correction_requests', (q) => q.eq('status', 'pending')),
      ]);

      if (leavePending || profilePending || correctionPending) {
        results.push({
          rule_id: rule.id,
          reminder_type: 'pending_approvals',
          employee_id: null,
          employee_name: null,
          title: 'Pending approvals summary',
          message: `Leave: ${leavePending}, Profile Updates: ${profilePending}, Attendance Corrections: ${correctionPending}`,
        });
      }
    }
  }

  return results;
}

async function runReminderWorkflow({
  sendEmail = true,
  generatedBy = null,
  generatedByName = null,
  source = 'manual',
} = {}) {
  const results = await buildReminderResults();

  if (results.length > 0) {
    await supabase.from('reminder_logs').insert(
      results.map((item) => ({
        rule_id: item.rule_id || null,
        reminder_type: item.reminder_type,
        employee_id: item.employee_id || null,
        title: item.title,
        message: item.message,
        status: sendEmail ? 'generated_email_pending' : 'generated',
        generated_by: generatedBy,
        generated_by_name: generatedByName || source,
      }))
    );
  }

  let emailResult = null;

  if (sendEmail) {
    try {
      emailResult = await sendReminderSummaryEmail(results);
    } catch (err) {
      emailResult = {
        sent: 0,
        error: err?.message || String(err),
      };
    }
  }

  await safeInsertSystemAudit({
    module: 'reminders',
    action: source === 'vercel_cron' ? 'cron_run_reminders' : 'run_reminders',
    changed_by: generatedBy,
    changed_by_name: generatedByName || source,
    new_data: {
      count: results.length,
      email: emailResult,
      source,
    },
  });

  return { results, email: emailResult };
}

async function checkTableHealth(table, buildQuery) {
  try {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (buildQuery) query = buildQuery(query);
    const { count, error } = await query;

    return {
      ok: !error,
      count: count || 0,
      error: error?.message || null,
    };
  } catch (err) {
    return {
      ok: false,
      count: 0,
      error: err?.message || String(err),
    };
  }
}

async function buildPolicyReadiness() {
  try {
    const { data, error } = await supabase
      .from('policy_readiness_items')
      .select('key, status');

    if (error) {
      return {
        ok: false,
        error: error?.message || 'Table unavailable.',
        item_count: 0,
        incomplete_count: 0,
      };
    }

    const items = data || [];

    return {
      ok: true,
      error: null,
      item_count: items.length,
      incomplete_count: items.filter((item) => item.status !== 'complete').length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      item_count: 0,
      incomplete_count: 0,
    };
  }
}

async function buildSystemHealth() {
  const checks = await Promise.all([
    checkTableHealth('employees'),
    checkTableHealth('attendance'),
    checkTableHealth('leave_requests'),
    checkTableHealth('claims'),
    checkTableHealth('payroll'),
    checkTableHealth('company_announcements'),
    checkTableHealth('reminder_rules'),
    checkTableHealth('reminder_logs'),
    checkTableHealth('system_audit_logs'),
    checkTableHealth('employee_documents'),
  ]);

  const tableNames = [
    'employees',
    'attendance',
    'leave_requests',
    'claims',
    'payroll',
    'company_announcements',
    'reminder_rules',
    'reminder_logs',
    'system_audit_logs',
    'employee_documents',
  ];

  let storageBuckets = [];
  let storageError = null;

  try {
    const { data, error } = await supabase.storage.listBuckets();
    storageBuckets = (data || []).map((bucket) => ({
      name: bucket.name,
      public: bucket.public,
    }));
    storageError = error?.message || null;
  } catch (err) {
    storageError = err?.message || String(err);
  }

  const { data: lastReminderLogs } = await supabase
    .from('reminder_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    ok: checks.every((item) => item.ok),
    checked_at: new Date().toISOString(),
    app: {
      app_base_url: process.env.APP_BASE_URL || 'https://hr-system2.vercel.app',
      node_env: process.env.NODE_ENV || null,
      cron_path: '/api/employees?cron_reminders=1',
      cron_schedule: '0 1 * * * UTC / 09:00 Malaysia time',
    },
    environment: {
      supabase_url: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      supabase_service_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
      smtp_host: Boolean(process.env.SMTP_HOST),
      smtp_user: Boolean(process.env.SMTP_USER),
      smtp_password: Boolean(process.env.SMTP_PASSWORD),
      smtp_from: Boolean(process.env.SMTP_FROM),
      app_base_url: Boolean(process.env.APP_BASE_URL),
      cron_secret: Boolean(process.env.CRON_SECRET),
    },
    tables: Object.fromEntries(tableNames.map((name, index) => [name, checks[index]])),
    storage: {
      ok: !storageError,
      error: storageError,
      buckets: storageBuckets,
      required_buckets: [
        'employee-documents',
        'leave-attachments',
        'claim-attachments',
      ].map((name) => ({
        name,
        exists: storageBuckets.some((bucket) => bucket.name === name),
      })),
    },
    reminders: {
      last_logs: lastReminderLogs || [],
    },
    policy: await buildPolicyReadiness(),
  };
}

async function buildMonthlyHrReport(period) {
  const range = getPeriodRange(period);

  const [
    totalEmployees,
    activeEmployees,
    newJoiners,
    attendanceRows,
    lateCount,
    leavePending,
    leaveApproved,
    claimsPending,
    claimsApprovedAmount,
    payrollNet,
    holidays,
    correctionsPending,
  ] = await Promise.all([
    countRows('employees'),
    countRows('employees', (q) => q.neq('status', 'inactive')),
    countRows('employees', (q) => q.gte('join_date', range.startDate).lte('join_date', range.endDate)),
    countRows('attendance', (q) => q.gte('date', range.startDate).lte('date', range.endDate)),
    countRows('attendance', (q) => q.gte('date', range.startDate).lte('date', range.endDate).eq('status', 'late')),
    countRows('leave_requests', (q) => q.eq('status', 'pending')),
    countRows('leave_requests', (q) => q.eq('status', 'approved').lte('start_date', range.endDate).gte('end_date', range.startDate)),
    countRows('claims', (q) => q.not('status', 'in', '(approved,rejected,cancelled,paid)')),
    sumRows('claims', 'amount', (q) => q.eq('status', 'approved').gte('claim_date', range.startDate).lte('claim_date', range.endDate)),
    sumRows('payroll', 'net_pay', (q) => q.eq('period', range.period)),
    supabase.from('company_holidays').select('*').gte('holiday_date', range.startDate).lte('holiday_date', range.endDate).then(({ data }) => data || []),
    countRows('attendance_correction_requests', (q) => q.eq('status', 'pending')),
  ]);

  return {
    period: range.period,
    start_date: range.startDate,
    end_date: range.endDate,
    generated_at: new Date().toISOString(),
    employees: {
      total: totalEmployees,
      active: activeEmployees,
      new_joiners: newJoiners,
    },
    attendance: {
      records: attendanceRows,
      late_count: lateCount,
      pending_corrections: correctionsPending,
    },
    leave: {
      pending: leavePending,
      approved_in_period: leaveApproved,
    },
    claims: {
      pending: claimsPending,
      approved_amount: Math.round(claimsApprovedAmount * 100) / 100,
    },
    payroll: {
      total_net_pay: Math.round(payrollNet * 100) / 100,
    },
    holidays,
  };
}

export default async function handler(req, res) {
  setCors(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let authUser = null;
  if (req.query?.cron_reminders !== '1' && req.query?.feature_flags !== 'true') {
    authUser = await requireAuth(req, res);
    if (!authUser) return;
  }

  try {
    // =========================
    // GET EMPLOYEE / EMPLOYEES
    // Supports:
    // /api/employees
    // /api/employees?email=test@email.com
    // /api/employees?id=1
    // =========================
    if (req.method === 'GET') {
      const { email, id, documents, employee_id, profile_update_requests } = req.query;

      if (req.query?.cron_reminders === '1') {
        const expectedSecret = process.env.CRON_SECRET;
        const authHeader = req.headers.authorization || '';

        if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
          return res.status(401).json({ error: 'Unauthorized cron request.' });
        }

        if (!(await isFeatureEnabled('reminder_scheduler'))) {
          return res.status(403).json({
            ok: false,
            error: 'Reminder Scheduler is currently disabled by Admin.',
          });
        }

        const result = await runReminderWorkflow({
          sendEmail: true,
          generatedBy: null,
          generatedByName: 'Vercel Cron',
          source: 'vercel_cron',
        });

        return res.status(200).json({
          ok: true,
          count: result.results.length,
          email: result.email,
        });
      }

      if (req.query?.system_health === 'true') {
        const health = await buildSystemHealth();

        return res.status(200).json(health);
      }

      if (req.query?.admin_config === 'true') {
        const config = await getAdminConfig();

        return res.status(200).json(config);
      }

      if (req.query?.feature_flags === 'true') {
        const flags = await getFeatureFlags();

        return res.status(200).json(flags);
      }

      if (req.query?.policy_readiness === 'true') {
        const { data, error } = await supabase
          .from('policy_readiness_items')
          .select('*')
          .order('key', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.document_checklist === 'true') {
        const checklist = await buildDocumentChecklist();

        return res.status(200).json(checklist);
      }

      if (req.query?.reminder_rules === 'true') {
        const { data, error } = await supabase
          .from('reminder_rules')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.reminder_logs === 'true') {
        const { data, error } = await supabase
          .from('reminder_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.announcements === 'true') {
        const { data, error } = await supabase
          .from('company_announcements')
          .select('*')
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.hr_letters === 'true') {
        let query = supabase
          .from('hr_letters')
          .select('*')
          .order('created_at', { ascending: false });

        if (employee_id) query = query.eq('employee_id', Number(employee_id));

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.performance_reviews === 'true') {
        let query = supabase
          .from('performance_reviews')
          .select('*')
          .order('review_period', { ascending: false })
          .order('created_at', { ascending: false });

        if (employee_id) query = query.eq('employee_id', Number(employee_id));

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.evaluation_templates === 'true') {
        let query = supabase
          .from('evaluation_templates')
          .select('*')
          .order('created_at', { ascending: false });

        if (req.query?.category) {
          query = query.eq('category', cleanString(req.query.category));
        }

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.evaluations === 'true') {
        let query = supabase
          .from('evaluations')
          .select('*')
          .order('review_period', { ascending: false })
          .order('created_at', { ascending: false });

        if (employee_id) query = query.eq('employee_id', Number(employee_id));

        if (req.query?.evaluator_id) {
          query = query.eq('evaluator_id', Number(req.query.evaluator_id));
        }

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.worker_rules === 'true') {
        let query = supabase.from('worker_evaluation_rules').select('*');

        if (employee_id) query = query.eq('employee_id', Number(employee_id));

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data || []);
      }

      if (req.query?.monthly_hr_report === 'true') {
        const report = await buildMonthlyHrReport(req.query.period);

        return res.status(200).json(report);
      }

      if (profile_update_requests === 'true') {
        let query = supabase
          .from('employee_profile_update_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (employee_id) {
          query = query.eq('employee_id', Number(employee_id));
        }

        const { data, error } = await query;

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        return res.status(200).json(data || []);
      }

      if (documents === 'true') {
        const employeeId = Number(employee_id || id);

        if (!employeeId) {
          return res.status(400).json({
            error: 'employee_id is required for documents.',
          });
        }

        const { data, error } = await supabase
          .from('employee_documents')
          .select('*')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false });

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(data || []);
      }

      if (req.query?.document_signed_url === 'true') {
        const documentId = Number(req.query.document_id);

        if (!documentId) {
          return res.status(400).json({
            error: 'document_id is required.',
          });
        }

        const { data: documentRow, error: documentError } = await supabase
          .from('employee_documents')
          .select('*')
          .eq('id', documentId)
          .maybeSingle();

        if (documentError) {
          return res.status(500).json({
            error: documentError.message,
          });
        }

        if (!documentRow) {
          return res.status(404).json({
            error: 'Document not found.',
          });
        }

        if (!documentRow.file_path) {
          if (documentRow.file_url) {
            return res.status(200).json({
              signedUrl: documentRow.file_url,
              expiresIn: null,
              legacyPublicUrl: true,
            });
          }

          return res.status(400).json({
            error: 'Document file path is missing.',
          });
        }

        const expiresIn = 600;
        const { data: signedData, error: signedError } = await supabase.storage
          .from('employee-documents')
          .createSignedUrl(documentRow.file_path, expiresIn);

        if (signedError) {
          return res.status(500).json({
            error: signedError.message,
          });
        }

        return res.status(200).json({
          signedUrl: signedData?.signedUrl,
          expiresIn,
        });
      }

      if (email) {
        const cleanEmail = normalizeEmail(email);

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(projectEmployee(data, authUser));
      }

      if (id) {
        const employeeId = Number(id);

        if (!employeeId) {
          return res.status(400).json({
            error: 'Valid employee ID is required.',
          });
        }

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('id', employeeId)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(projectEmployee(data, authUser));
      }

      const listLimit = Number(req.query.limit) || 0;
      const listOffset = Number(req.query.offset) || 0;

      let listQuery = supabase
        .from('employees')
        .select('*')
        .order('id', { ascending: true });

      if (listLimit > 0) {
        listQuery = listQuery.range(listOffset, listOffset + listLimit - 1);
      }

      const { data, error } = await listQuery;

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json((data || []).map((row) => projectEmployee(row, authUser)));
    }

    // =========================
    // ADD EMPLOYEE
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'import_employees') {
        return await handleImportEmployees(req, res, { supabase, authUser, body });
      }

      if (body.action === 'import_create_accounts') {
        return await handleImportCreateAccounts(req, res, { supabase, authUser, body });
      }

      if (body.action === 'admin_config_save') {
        const savedConfig = await saveAdminConfig(body.config || {}, body);

        await safeInsertSystemAudit({
          module: 'admin_config',
          action: 'config_update',
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: savedConfig,
        });

        return res.status(200).json(savedConfig);
      }

      if (body.action === 'policy_readiness_update') {
        const role = authUser?.role || 'employee';

        if (role !== 'admin') {
          return res.status(403).json({
            error: 'Only admin can update policy readiness.',
          });
        }

        const key = String(body.key || '').trim();

        if (!key) {
          return res.status(400).json({ error: 'Policy readiness key is required.' });
        }

        const allowedStatuses = ['complete', 'needs_review', 'not_started'];
        const status = body.reset ? 'needs_review' : String(body.status || '').toLowerCase();

        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({
            error: 'Invalid policy readiness status.',
          });
        }

        const payload = {
          status,
          owner: body.owner !== undefined ? cleanString(body.owner) || null : null,
          evidence: body.reset ? null : body.evidence !== undefined ? cleanString(body.evidence) || null : null,
          updated_by: authUser?.id || null,
          updated_by_name: authUser?.name || null,
          updated_at: new Date().toISOString(),
        };

        if (status === 'complete') {
          payload.last_reviewed_at = new Date().toISOString();
        }

        if (body.reset) {
          payload.last_reviewed_at = null;
        }

        const { data, error } = await supabase
          .from('policy_readiness_items')
          .update(payload)
          .eq('key', key)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'policy_center',
          action: 'policy_readiness_update',
          record_id: key,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: data,
        });

        return res.status(200).json(data);
      }

      if (body.action === 'feature_flag_update') {
        const role = authUser?.role || 'employee';

        if (role !== 'admin') {
          return res.status(403).json({
            error: 'Only admin can update feature flags.',
          });
        }

        const key = String(body.key || '').trim();

        if (!key) {
          return res.status(400).json({ error: 'Feature flag key is required.' });
        }

        let savedFlag;
        try {
          savedFlag = await saveFeatureFlag(
            { key, enabled: body.enabled, label: body.label, category: body.category },
            body
          );
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }

        await safeInsertSystemAudit({
          module: 'feature_flags',
          action: 'feature_flag_update',
          record_id: key,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: savedFlag,
        });

        return res.status(200).json(savedFlag);
      }

      if (body.action === 'feature_flags_bulk_update') {
        const role = authUser?.role || 'employee';

        if (role !== 'admin') {
          return res.status(403).json({
            error: 'Only admin can update feature flags.',
          });
        }

        const flags = Array.isArray(body.flags) ? body.flags : [];

        if (!flags.length) {
          return res.status(400).json({ error: 'No feature flags provided.' });
        }

        let savedFlags;
        try {
          savedFlags = await saveFeatureFlags(flags, body);
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }

        await safeInsertSystemAudit({
          module: 'feature_flags',
          action: 'feature_flags_bulk_update',
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: savedFlags,
        });

        return res.status(200).json(savedFlags);
      }

      if (body.action === 'reminder_rule_save') {
        const payload = {
          name: cleanString(body.name),
          reminder_type: body.reminder_type || 'expiry',
          days_before: Number(body.days_before || 0),
          enabled: body.enabled !== false,
          updated_at: new Date().toISOString(),
        };

        if (!payload.name) {
          return res.status(400).json({ error: 'Reminder rule name is required.' });
        }

        if (await recordExists('reminder_rules', [['name', payload.name, 'ilike']], body.id)) {
          return res.status(409).json({
            error: 'A reminder rule with this name already exists.',
          });
        }

        let query;
        if (body.id) {
          query = supabase.from('reminder_rules').update(payload).eq('id', Number(body.id));
        } else {
          query = supabase.from('reminder_rules').insert({
            ...payload,
            created_by: authUser?.id || null,
            created_by_name: authUser?.name || null,
          });
        }

        const { data, error } = await query.select().single();
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'reminders',
          action: body.id ? 'rule_update' : 'rule_create',
          record_id: data?.id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: data,
        });

        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'reminder_rule_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });

        const { data: oldRow } = await supabase
          .from('reminder_rules')
          .select('*')
          .eq('id', Number(body.id))
          .maybeSingle();

        const { error } = await supabase
          .from('reminder_rules')
          .delete()
          .eq('id', Number(body.id));

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'reminders',
          action: 'rule_delete',
          record_id: Number(body.id),
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });

        return res.status(200).json({ ok: true });
      }

      if (body.action === 'run_reminders') {
        if (!(await isFeatureEnabled('reminder_scheduler'))) {
          return res.status(403).json({
            error: 'Reminder Scheduler is currently disabled by Admin.',
          });
        }

        const result = await runReminderWorkflow({
          sendEmail: body.send_email !== false,
          generatedBy: authUser?.id || null,
          generatedByName: authUser?.name || null,
          source: 'manual',
        });

        return res.status(200).json(result);
      }

      if (body.action === 'announcement_save') {
        const payload = {
          title: cleanString(body.title),
          body: cleanString(body.body),
          category: body.category || 'General',
          pinned: Boolean(body.pinned),
          expires_at: body.expires_at || null,
          updated_at: new Date().toISOString(),
        };

        if (!payload.title || !payload.body) {
          return res.status(400).json({ error: 'Title and announcement body are required.' });
        }

        if (
          await recordExists(
            'company_announcements',
            [['title', payload.title, 'ilike']],
            body.id
          )
        ) {
          return res.status(409).json({
            error: 'An announcement with this title already exists. Please edit the existing announcement or use a different title.',
          });
        }

        let query;
        if (body.id) {
          query = supabase.from('company_announcements').update(payload).eq('id', Number(body.id));
        } else {
          query = supabase.from('company_announcements').insert({
            ...payload,
            created_by: authUser?.id || null,
            created_by_name: authUser?.name || null,
          });
        }

        const { data, error } = await query.select().single();
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'announcements',
          action: body.id ? 'announcement_update' : 'announcement_create',
          record_id: data?.id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: data,
        });

        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'announcement_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });

        const { data: oldRow } = await supabase
          .from('company_announcements')
          .select('*')
          .eq('id', Number(body.id))
          .maybeSingle();

        const { error } = await supabase
          .from('company_announcements')
          .delete()
          .eq('id', Number(body.id));

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'announcements',
          action: 'announcement_delete',
          record_id: Number(body.id),
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });

        return res.status(200).json({ ok: true });
      }

      if (body.action === 'hr_letter_save') {
        const employeeId = Number(body.employee_id);

        if (!employeeId || !body.title || !body.content) {
          return res.status(400).json({ error: 'employee_id, title and content are required.' });
        }

        if (
          await recordExists(
            'hr_letters',
            [
              ['employee_id', employeeId],
              ['title', cleanString(body.title), 'ilike'],
            ],
            body.id
          )
        ) {
          return res.status(409).json({
            error: 'This employee already has an HR letter with the same title.',
          });
        }

        const payload = {
          employee_id: employeeId,
          template_type: body.template_type || 'general_letter',
          title: cleanString(body.title),
          content: String(body.content),
          status: body.status || 'draft',
          generated_by: authUser?.id || null,
          generated_by_name: authUser?.name || null,
          updated_at: new Date().toISOString(),
        };

        let query;
        if (body.id) {
          query = supabase.from('hr_letters').update(payload).eq('id', Number(body.id));
        } else {
          query = supabase.from('hr_letters').insert(payload);
        }

        const { data, error } = await query.select().single();
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'hr_letters',
          action: body.id ? 'letter_update' : 'letter_create',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: data,
        });

        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'hr_letter_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });

        const { data: oldRow } = await supabase.from('hr_letters').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('hr_letters').delete().eq('id', Number(body.id));
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'hr_letters',
          action: 'letter_delete',
          record_id: Number(body.id),
          employee_id: oldRow?.employee_id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });

        return res.status(200).json({ ok: true });
      }

      if (body.action === 'performance_save') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.review_period) {
          return res.status(400).json({ error: 'employee_id and review_period are required.' });
        }

        if (
          await recordExists(
            'performance_reviews',
            [
              ['employee_id', employeeId],
              ['review_period', cleanString(body.review_period)],
              ['review_type', body.review_type || 'Annual Review'],
            ],
            body.id
          )
        ) {
          return res.status(409).json({
            error: 'This employee already has the same review type for this review period.',
          });
        }

        const payload = {
          employee_id: employeeId,
          review_period: cleanString(body.review_period),
          review_type: body.review_type || 'Annual Review',
          reviewer_id: body.reviewer_id || authUser?.id || null,
          reviewer_name: body.reviewer_name || authUser?.name || null,
          kpi_score: toNullableNumber(body.kpi_score) || 0,
          behavior_score: toNullableNumber(body.behavior_score) || 0,
          attendance_score: toNullableNumber(body.attendance_score) || 0,
          overall_score: toNullableNumber(body.overall_score) || 0,
          strengths: body.strengths || null,
          improvements: body.improvements || null,
          goals: body.goals || null,
          recommendation: body.recommendation || null,
          manager_remarks: body.manager_remarks || null,
          admin_remarks: body.admin_remarks || null,
          status: body.status || 'draft',
          updated_at: new Date().toISOString(),
        };

        let query;
        if (body.id) {
          query = supabase.from('performance_reviews').update(payload).eq('id', Number(body.id));
        } else {
          query = supabase.from('performance_reviews').insert(payload);
        }

        const { data, error } = await query.select().single();
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: body.id ? 'review_update' : 'review_create',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: authUser?.id || body.reviewer_id || null,
          changed_by_name: authUser?.name || body.reviewer_name || null,
          new_data: data,
        });

        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'performance_acknowledge') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.id) {
          return res.status(400).json({ error: 'id and employee_id are required.' });
        }

        const { data: existing } = await supabase
          .from('performance_reviews')
          .select('*')
          .eq('id', Number(body.id))
          .maybeSingle();

        if (!existing) {
          return res.status(404).json({ error: 'Performance review not found.' });
        }

        if (Number(existing.employee_id) !== employeeId) {
          return res.status(403).json({
            error: 'Employees can only acknowledge their own reviews.',
          });
        }

        if (existing.employee_acknowledged) {
          return res.status(409).json({
            error: 'This review has already been acknowledged.',
          });
        }

        const { data, error } = await supabase
          .from('performance_reviews')
          .update({
            employee_acknowledged: true,
            employee_acknowledged_at: new Date().toISOString(),
            acknowledged_by: employeeId,
            acknowledged_by_name: body.employee_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', Number(body.id))
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: 'review_acknowledge',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: employeeId,
          changed_by_name: body.employee_name || null,
          new_data: data,
        });

        return res.status(200).json(data);
      }

      if (body.action === 'performance_delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required.' });
        const { data: oldRow } = await supabase.from('performance_reviews').select('*').eq('id', Number(body.id)).maybeSingle();
        const { error } = await supabase.from('performance_reviews').delete().eq('id', Number(body.id));
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: 'review_delete',
          record_id: Number(body.id),
          employee_id: oldRow?.employee_id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });

        return res.status(200).json({ ok: true });
      }

      if (body.action === 'worker_login') {
        const rawId = cleanString(body.employee_no || body.employee_id || '');

        if (!rawId) {
          return res.status(400).json({ error: 'Please enter your employee ID.' });
        }

        let employee = null;

        const { data: byNo } = await supabase
          .from('employees')
          .select('*')
          .eq('employee_no', rawId)
          .maybeSingle();

        if (byNo) {
          employee = byNo;
        } else {
          const numericId = Number(rawId);

          if (numericId) {
            const { data: byId } = await supabase
              .from('employees')
              .select('*')
              .eq('id', numericId)
              .maybeSingle();

            employee = byId || null;
          }
        }

        if (!employee) {
          return res.status(404).json({ error: 'No employee found with this ID.' });
        }

        if (String(employee.status || '').toLowerCase() === 'inactive') {
          return res.status(403).json({ error: 'This account is inactive. Please contact HR.' });
        }

        const token = crypto.randomUUID();

        const { error: tokenError } = await supabase.from('worker_sessions').insert({
          employee_id: employee.id,
          token,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });

        if (tokenError) return res.status(500).json({ error: tokenError.message });

        return res.status(200).json({ token, employee: publicEmployee(employee) });
      }

      if (body.action === 'worker_session') {
        const token = cleanString(body.token);

        if (!token) {
          return res.status(401).json({ error: 'Missing session token.' });
        }

        const { data: session, error: sessionError } = await supabase
          .from('worker_sessions')
          .select('*')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (sessionError || !session) {
          return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
        }

        const { data: employee, error: employeeError } = await supabase
          .from('employees')
          .select('*')
          .eq('id', session.employee_id)
          .maybeSingle();

        if (
          employeeError ||
          !employee ||
          String(employee.status || '').toLowerCase() === 'inactive'
        ) {
          return res.status(401).json({ error: 'Account not found or inactive.' });
        }

        return res.status(200).json({ employee: publicEmployee(employee) });
      }

      if (body.action === 'template_save') {
        const actorRole = authUser?.role || 'employee';

        if (actorRole !== 'admin') {
          return res.status(403).json({ error: 'Only admin can manage evaluation templates.' });
        }

        const name = cleanString(body.name);
        const category = cleanString(body.category).toLowerCase();

        if (!name) {
          return res.status(400).json({ error: 'Template name is required.' });
        }

        if (!EVALUATION_CATEGORIES.includes(category)) {
          return res.status(400).json({
            error: 'Template category must be Worker, Employee or Manager.',
          });
        }

        const sections = sanitizeTemplateSections(body.sections);

        if (!sections.length) {
          return res.status(400).json({
            error: 'Template must contain at least one section with scored criteria.',
          });
        }

        const payload = {
          name,
          category,
          department: cleanString(body.department) || null,
          description: cleanString(body.description) || null,
          sections,
          status: body.status === 'inactive' ? 'inactive' : 'active',
          updated_at: new Date().toISOString(),
        };

        let query;
        if (body.id) {
          query = supabase.from('evaluation_templates').update(payload).eq('id', Number(body.id));
        } else {
          payload.created_by = authUser?.id || null;
          payload.created_by_name = authUser?.name || null;
          query = supabase.from('evaluation_templates').insert(payload);
        }

        const { data, error } = await query.select().single();
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: body.id ? 'template_update' : 'template_create',
          record_id: data?.id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: data,
        });

        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'template_delete') {
        const actorRole = authUser?.role || 'employee';

        if (actorRole !== 'admin') {
          return res.status(403).json({ error: 'Only admin can delete evaluation templates.' });
        }

        if (!body.id) return res.status(400).json({ error: 'id is required.' });

        const { data: oldRow } = await supabase
          .from('evaluation_templates')
          .select('*')
          .eq('id', Number(body.id))
          .maybeSingle();

        const { error } = await supabase
          .from('evaluation_templates')
          .delete()
          .eq('id', Number(body.id));

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: 'template_delete',
          record_id: Number(body.id),
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });

        return res.status(200).json({ ok: true });
      }

      if (body.action === 'evaluation_save') {
        const actorRole = authUser?.role || 'employee';

        if (!['admin', 'manager'].includes(actorRole)) {
          return res.status(403).json({
            error: 'Only admin or manager can submit evaluations.',
          });
        }

        const templateId = Number(body.template_id);
        const employeeId = Number(body.employee_id);

        if (!templateId || !employeeId || !cleanString(body.review_period)) {
          return res.status(400).json({
            error: 'template_id, employee_id and review_period are required.',
          });
        }

        const { data: template, error: templateError } = await supabase
          .from('evaluation_templates')
          .select('*')
          .eq('id', templateId)
          .maybeSingle();

        if (templateError) return res.status(500).json({ error: templateError.message });
        if (!template) return res.status(404).json({ error: 'Evaluation template not found.' });
        if (String(template.status || '').toLowerCase() === 'inactive') {
          return res.status(403).json({ error: 'This evaluation template is inactive.' });
        }

        const scores = sanitizeEvaluationScores(body.scores, template.sections);
        const overallScore = computeOverallScore(scores, template.sections);

        const payload = {
          template_id: templateId,
          employee_id: employeeId,
          evaluator_id: body.evaluator_id || authUser?.id || null,
          evaluator_name: body.evaluator_name || authUser?.name || null,
          evaluator_role: body.evaluator_role || actorRole,
          review_period: cleanString(body.review_period),
          scores,
          overall_score: overallScore,
          status: body.status === 'completed' ? 'completed' : 'draft',
          updated_at: new Date().toISOString(),
        };

        let query;
        if (body.id) {
          query = supabase.from('evaluations').update(payload).eq('id', Number(body.id));
        } else {
          query = supabase.from('evaluations').insert(payload);
        }

        const { data, error } = await query.select().single();
        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: body.id ? 'evaluation_update' : 'evaluation_create',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: payload.evaluator_id,
          changed_by_name: payload.evaluator_name,
          new_data: data,
        });

        return res.status(body.id ? 200 : 201).json(data);
      }

      if (body.action === 'evaluation_acknowledge') {
        const employeeId = Number(body.employee_id);

        if (!employeeId || !body.id) {
          return res.status(400).json({ error: 'id and employee_id are required.' });
        }

        const { data: existing } = await supabase
          .from('evaluations')
          .select('*')
          .eq('id', Number(body.id))
          .maybeSingle();

        if (!existing) {
          return res.status(404).json({ error: 'Evaluation not found.' });
        }

        if (Number(existing.employee_id) !== employeeId) {
          return res.status(403).json({
            error: 'Employees can only acknowledge their own evaluations.',
          });
        }

        if (existing.employee_acknowledged) {
          return res.status(409).json({ error: 'This evaluation has already been acknowledged.' });
        }

        const { data, error } = await supabase
          .from('evaluations')
          .update({
            employee_acknowledged: true,
            employee_acknowledged_at: new Date().toISOString(),
            acknowledged_by: employeeId,
            acknowledged_by_name: body.employee_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', Number(body.id))
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: 'evaluation_acknowledge',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: employeeId,
          changed_by_name: body.employee_name || null,
          new_data: data,
        });

        return res.status(200).json(data);
      }

      if (body.action === 'evaluation_delete') {
        const actorRole = authUser?.role || 'employee';

        if (!['admin', 'manager'].includes(actorRole)) {
          return res.status(403).json({ error: 'Only admin or manager can delete evaluations.' });
        }

        if (!body.id) return res.status(400).json({ error: 'id is required.' });

        const { data: oldRow } = await supabase
          .from('evaluations')
          .select('*')
          .eq('id', Number(body.id))
          .maybeSingle();

        const { error } = await supabase
          .from('evaluations')
          .delete()
          .eq('id', Number(body.id));

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: 'evaluation_delete',
          record_id: Number(body.id),
          employee_id: oldRow?.employee_id || null,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          old_data: oldRow,
        });

        return res.status(200).json({ ok: true });
      }

      if (body.action === 'worker_rule_save') {
        const actorRole = authUser?.role || 'employee';

        if (actorRole !== 'admin') {
          return res.status(403).json({ error: 'Only admin can assign worker evaluation rules.' });
        }

        const employeeId = Number(body.employee_id);
        const templateId = Number(body.template_id);

        if (!employeeId) {
          return res.status(400).json({ error: 'employee_id is required.' });
        }

        let criteria = [];

        if (templateId) {
          const { data: template, error: templateError } = await supabase
            .from('evaluation_templates')
            .select('*')
            .eq('id', templateId)
            .maybeSingle();

          if (templateError) return res.status(500).json({ error: templateError.message });
          if (!template) return res.status(404).json({ error: 'Template not found.' });

          const allowedIds = new Set(
            (Array.isArray(body.criteria) ? body.criteria : []).map((c) => cleanString(c))
          );

          criteria = templateCriteriaSections(template.sections)
            .map((criterion) => ({
              id: criterion.id,
              name: criterion.name,
              max_score: criterion.max_score,
            }))
            .filter((criterion) => allowedIds.has(criterion.id));
        }

        const payload = {
          employee_id: employeeId,
          template_id: templateId || null,
          criteria,
          active: body.active !== false,
          updated_by: authUser?.id || null,
          updated_by_name: authUser?.name || null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('worker_evaluation_rules')
          .upsert(payload, { onConflict: 'employee_id' })
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'performance',
          action: 'worker_rule_save',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: payload.updated_by,
          changed_by_name: payload.updated_by_name,
          new_data: data,
        });

        return res.status(200).json(data);
      }

      if (body.action === 'profile_update_request_create') {
        const employeeId = Number(body.employee_id);
        const requestedData = pickProfileUpdateData(body.requested_data || body);

        if (body.requested_data) {
          const parsedProfile = parseProfileUpdate(body.requested_data);
          if (!parsedProfile.success) {
            return res.status(400).json({ error: parsedProfile.error });
          }
        }

        if (!employeeId || Object.keys(requestedData).length === 0) {
          return res.status(400).json({
            error: 'employee_id and at least one requested field are required.',
          });
        }

        const { data: pendingRequest, error: pendingRequestError } = await supabase
          .from('employee_profile_update_requests')
          .select('id')
          .eq('employee_id', employeeId)
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();

        if (pendingRequestError) {
          return res.status(500).json({ error: pendingRequestError.message });
        }

        if (pendingRequest) {
          return res.status(409).json({
            error: 'You already have a pending profile update request. Please wait for Admin decision before submitting another.',
          });
        }

        const { data, error } = await supabase
          .from('employee_profile_update_requests')
          .insert({
            employee_id: employeeId,
            requested_by: body.requested_by || employeeId,
            requested_by_name: body.requested_by_name || null,
            requested_data: requestedData,
            reason: body.reason ? cleanString(body.reason) : null,
            status: 'pending',
          })
          .select()
          .single();

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        await safeInsertSystemAudit({
          module: 'employee_profile',
          action: 'profile_update_request_create',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: body.requested_by || employeeId,
          changed_by_name: body.requested_by_name || null,
          new_data: data,
          reason: body.reason || null,
        });

        return res.status(201).json(data);
      }

      if (body.action === 'document_create') {
        const employeeId = Number(body.employee_id);

        if (!employeeId || !body.title || !body.file_path) {
          return res.status(400).json({
            error: 'employee_id, title and file_path are required.',
          });
        }

        if (
          await recordExists('employee_documents', [
            ['employee_id', employeeId],
            ['document_type', body.document_type || 'Other HR Document'],
            ['title', cleanString(body.title), 'ilike'],
          ])
        ) {
          return res.status(409).json({
            error: 'This employee already has a document with the same type and title.',
          });
        }

        const { data, error } = await supabase
          .from('employee_documents')
          .insert({
            employee_id: employeeId,
            document_type: body.document_type || 'Other HR Document',
            title: cleanString(body.title),
            file_url: body.file_url || null,
            file_path: body.file_path,
            visibility: body.visibility || 'hr_only',
            uploaded_by: body.uploaded_by || null,
            uploaded_by_name: body.uploaded_by_name || null,
          })
          .select()
          .single();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        await safeInsertSystemAudit({
          module: 'employee_documents',
          action: 'document_upload',
          record_id: data?.id || null,
          employee_id: data?.employee_id || employeeId,
          changed_by: body.uploaded_by || null,
          changed_by_name: body.uploaded_by_name || null,
          new_data: data,
        });

        return res.status(201).json(data);
      }

      if (!body.name || !body.email) {
        return res.status(400).json({
          error: 'Name and email are required.',
        });
      }

      const payload = buildEmployeePayload(body, { partial: false });

      if (await recordExists('employees', [['email', payload.email, 'ilike']])) {
        return res.status(409).json({
          error: 'An employee with this email already exists. Please use a different email or edit the existing employee.',
        });
      }

      if (
        payload.employee_no &&
        (await recordExists('employees', [['employee_no', payload.employee_no]]))
      ) {
        return res.status(409).json({
          error: 'This employee ID is already in use. Please use a different employee ID.',
        });
      }

      const { data, error } = await supabase
        .from('employees')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: friendlyDatabaseError(error, 'Failed to add employee. Please try again.'),
        });
      }

      return res.status(201).json(data);
    }

    // =========================
    // EDIT EMPLOYEE
    // Admin-only in UI; API updates provided fields
    // =========================
    if (req.method === 'PUT') {
      const body = req.body || {};

      if (!assertAdmin(authUser, res)) return;

      if (body.action === 'profile_update_decision') {
        const requestId = Number(body.id || body.request_id);
        const decision = cleanString(body.status).toLowerCase();

        if (!requestId || !['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({
            error: 'Valid request id and status approved/rejected are required.',
          });
        }

        const { data: requestRow, error: requestError } = await supabase
          .from('employee_profile_update_requests')
          .select('*')
          .eq('id', requestId)
          .maybeSingle();

        if (requestError) return res.status(500).json({ error: requestError.message });
        if (!requestRow) return res.status(404).json({ error: 'Request not found.' });
        if (requestRow.status !== 'pending') {
          return res.status(409).json({ error: 'Request already decided.' });
        }

        let updatedEmployee = null;

        if (decision === 'approved') {
          const { data: employeeData, error: employeeError } = await supabase
            .from('employees')
            .update(pickProfileUpdateData(requestRow.requested_data || {}))
            .eq('id', requestRow.employee_id)
            .select()
            .single();

          if (employeeError) return res.status(500).json({ error: employeeError.message });
          updatedEmployee = employeeData;
        }

        const { data, error } = await supabase
          .from('employee_profile_update_requests')
          .update({
            status: decision,
            admin_remarks: body.admin_remarks || null,
            decided_by: body.decided_by || null,
            decided_by_name: body.decided_by_name || null,
            decided_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestId)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'employee_profile',
          action: `profile_update_${decision}`,
          record_id: requestId,
          employee_id: requestRow.employee_id,
          changed_by: body.decided_by || null,
          changed_by_name: body.decided_by_name || null,
          old_data: requestRow,
          new_data: { request: data, employee: updatedEmployee },
          reason: body.admin_remarks || null,
        });

        return res.status(200).json(data);
      }

      const id = Number(body.id || req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'Employee ID is required.',
        });
      }

      const { data: existing, error: findError } = await supabase
        .from('employees')
        .select('id, email, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) {
        return res.status(500).json({
          error: findError.message,
        });
      }

      if (!existing) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      const payload = buildEmployeePayload(body, { partial: true });

      if (payload.email && await recordExists('employees', [['email', payload.email, 'ilike']], id)) {
        return res.status(409).json({
          error: 'Another employee already uses this email address.',
        });
      }

      if (
        payload.employee_no &&
        (await recordExists('employees', [['employee_no', payload.employee_no]], id))
      ) {
        return res.status(409).json({
          error: 'Another employee already uses this employee ID.',
        });
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({
          error: 'No fields to update.',
        });
      }

      const { data, error } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: friendlyDatabaseError(error, 'Failed to update employee. Please try again.'),
        });
      }

      return res.status(200).json({
        success: true,
        employee: data,
      });
    }

    // =========================
    // SOFT DELETE / DEACTIVATE EMPLOYEE
    // Does NOT remove employee from database.
    // Only changes status to inactive.
    // =========================
    if (req.method === 'DELETE') {
      if (!assertAdmin(authUser, res)) return;

      const documentId = Number(req.query.document_id);

      if (documentId) {
        const { data: documentRow, error: findError } = await supabase
          .from('employee_documents')
          .select('*')
          .eq('id', documentId)
          .maybeSingle();

        if (findError) {
          return res.status(500).json({
            error: findError.message,
          });
        }

        if (!documentRow) {
          return res.status(404).json({
            error: 'Document not found.',
          });
        }

        const { error } = await supabase
          .from('employee_documents')
          .delete()
          .eq('id', documentId);

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        if (documentRow.file_path) {
          await supabase.storage
            .from('employee-documents')
            .remove([documentRow.file_path]);
        }

        await safeInsertSystemAudit({
          module: 'employee_documents',
          action: 'document_delete',
          record_id: documentId,
          employee_id: documentRow.employee_id || null,
          changed_by: req.query.changed_by || null,
          changed_by_name: req.query.changed_by_name || null,
          old_data: documentRow,
        });

        return res.status(200).json({ success: true });
      }

      const id = Number(req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'Employee ID is required.',
        });
      }

      const { data: employee, error: findError } = await supabase
        .from('employees')
        .select('id, name, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) {
        return res.status(500).json({
          error: findError.message,
        });
      }

      if (!employee) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      const role = String(employee.role || '').toLowerCase();

      if (role === 'admin') {
        return res.status(403).json({
          error: 'Admin profile cannot be deactivated from this action.',
        });
      }

      if (employee.status === 'inactive') {
        return res.status(200).json({
          success: true,
          message: 'Employee is already inactive.',
          employee,
        });
      }

      const { data, error: updateError } = await supabase
        .from('employees')
        .update({
          status: 'inactive',
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          error: updateError.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Employee deactivated successfully.',
        employee: data,
      });
    }

    return res.status(405).json({
      error: `Method ${req.method} not allowed.`,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error.',
    });
  }
}