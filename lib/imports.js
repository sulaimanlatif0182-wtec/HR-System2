// Extracted from api/employees.js to reduce the monolith.
// NOTE: helpers are imported from employees.js; this is a deliberate,
// runtime-safe circular import (the helpers are only referenced inside the
// exported functions, never at module-init time). Once the helpers are moved
// into api/lib/employeeHelpers.js this cycle can be removed.
import { isRateLimited } from './rateLimit.js';
import { assertAdmin } from './authorize.js';
import { parseAccountEmail } from './validators.js';
import { sendNotificationEmail } from '../server/email.js';
import {
  cleanString,
  normalizeEmail,
  recordExists,
  buildEmployeePayload,
  friendlyDatabaseError,
  safeInsertSystemAudit,
  generateTempPassword,
} from '../api/employees.js';

export async function handleImportEmployees(req, res, { supabase, authUser, body }) {
  if (isRateLimited(`import_employees:${authUser?.id || req.ip || 'anon'}`, { windowMs: 60 * 1000, max: 5 })) {
    return res.status(429).json({ error: 'Too many import requests. Please try again later.' });
  }

  if (!assertAdmin(authUser, res)) return;

  const rows = Array.isArray(body.employees) ? body.employees : [];

  if (!rows.length) {
    return res.status(400).json({
      error: 'No employee rows provided for import.',
    });
  }

  if (rows.length > 500) {
    return res.status(400).json({
      error: 'Import is limited to 500 rows at a time.',
    });
  }

  const inserted = [];
  const skipped = [];
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;

    if (!row || typeof row !== 'object') {
      errors.push({ row: rowNumber, email: '', message: 'Invalid row.' });
      continue;
    }

    const name = cleanString(row.name);
    const email = normalizeEmail(row.email);

    if (!name || !email) {
      errors.push({
        row: rowNumber,
        email,
        message: 'Name and email are required.',
      });
      continue;
    }

    if (await recordExists('employees', [['email', email, 'ilike']])) {
      skipped.push({
        row: rowNumber,
        email,
        message: 'Employee with this email already exists.',
      });
      continue;
    }

    const payload = buildEmployeePayload(row, { partial: false });

    const { data, error } = await supabase
      .from('employees')
      .insert(payload)
      .select()
      .single();

    if (error) {
      errors.push({
        row: rowNumber,
        email,
        message: friendlyDatabaseError(error, 'Failed to import employee.'),
      });
      continue;
    }

    inserted.push(data);
  }

  if (inserted.length) {
    await safeInsertSystemAudit({
      module: 'employees',
      action: 'employees_import',
      changed_by: authUser?.id || null,
      changed_by_name: authUser?.name || null,
      new_data: {
        inserted: inserted.length,
        skipped: skipped.length,
        errors: errors.length,
      },
    });
  }

  return res.status(200).json({
    total: rows.length,
    inserted: inserted.length,
    skipped: skipped.length,
    errors: errors.length,
    insertedRows: inserted,
    skippedRows: skipped,
    errorRows: errors,
  });
}

export async function handleImportCreateAccounts(req, res, { supabase, authUser, body }) {
  if (isRateLimited(`import_create_accounts:${authUser?.id || req.ip || 'anon'}`, { windowMs: 60 * 1000, max: 5 })) {
    return res.status(429).json({ error: 'Too many account-creation requests. Please try again later.' });
  }

  if (!assertAdmin(authUser, res)) return;

  const rows = Array.isArray(body.employees) ? body.employees : [];

  if (!rows.length) {
    return res.status(400).json({
      error: 'No employees provided for account creation.',
    });
  }

  if (rows.length > 500) {
    return res.status(400).json({
      error: 'Account creation is limited to 500 rows at a time.',
    });
  }

  const created = [];
  const skipped = [];
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const email = normalizeEmail(row.email);

    if (!email) {
      errors.push({ row: rowNumber, email: '', message: 'Email is required.' });
      continue;
    }

    const emailCheck = parseAccountEmail(email);
    if (!emailCheck.success) {
      errors.push({ row: rowNumber, email, message: emailCheck.error });
      continue;
    }

    const tempPassword = generateTempPassword();

    const { error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createErr) {
      const msg = (createErr.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        skipped.push({ row: rowNumber, email, message: 'An account with this email already exists.' });
      } else {
        errors.push({ row: rowNumber, email, message: createErr.message });
      }
      continue;
    }

    // Deliver the temporary password over email. Never return it in the
    // API response — doing so would expose plaintext credentials to the
    // client/browser and any intermediary that logs the payload.
    const emailResult = await sendNotificationEmail({
      to: email,
      subject: 'Your WtecHR account has been created',
      title: 'Welcome to WtecHR',
      message: `Your WtecHR login account has been created. Your temporary password is: ${tempPassword}. Please sign in and change it immediately.`,
      link: '/login',
      actionLabel: 'Sign In',
    }).catch(() => ({ ok: false }));

    created.push({
      row: rowNumber,
      email,
      emailDelivered: Boolean(emailResult?.ok),
    });
  }

  if (created.length) {
    await safeInsertSystemAudit({
      module: 'employees',
      action: 'employee_accounts_created',
      changed_by: authUser?.id || null,
      changed_by_name: authUser?.name || null,
      new_data: {
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
    });
  }

  return res.status(200).json({
    total: rows.length,
    created: created.length,
    passwordsEmailed: created.filter((c) => c.emailDelivered).length,
    passwordsEmailFailed: created.filter((c) => !c.emailDelivered).length,
    skipped: skipped.length,
    errors: errors.length,
    createdRows: created,
    skippedRows: skipped,
    errorRows: errors,
  });
}
