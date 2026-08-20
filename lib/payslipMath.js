// Pure payslip helpers extracted from api/payslip.js so they can be
// unit-tested without PDF generation or a database.

export function money(value) {
  return `RM ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function formatDate(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-MY', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function makePassword(dateOfBirth, identityLast4) {
  if (!dateOfBirth || !identityLast4) {
    return null;
  }

  const date = new Date(dateOfBirth);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const last4 = String(identityLast4).trim();

  if (last4.length < 4) {
    return null;
  }

  return `${yy}${mm}${dd}${last4.slice(-4)}`;
}

export function totalEmployeeDeductions(payroll = {}) {
  return (
    numberValue(payroll.epf_employee) +
    numberValue(payroll.socso_employee) +
    numberValue(payroll.eis_employee) +
    numberValue(payroll.pcb) +
    numberValue(payroll.leave_deduction) +
    numberValue(payroll.lunch_deduction) +
    numberValue(payroll.deductions)
  );
}

export function safeFileName(name, id) {
  return String(name || `employee-${id}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}