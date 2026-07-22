import supabase from '../db-client.js';
import { sendNotificationEmail } from './email.js';

function sameDepartment(a, b) {
  return (
    String(a || '').trim().toLowerCase() ===
    String(b || '').trim().toLowerCase()
  );
}

async function getEmployee(employeeId) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function getAdmins() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('role', 'admin')
    .eq('status', 'active');

  if (error) throw error;

  return data || [];
}

async function getManagersByDepartment(department) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('role', 'manager')
    .eq('status', 'active');

  if (error) throw error;

  return (data || []).filter((manager) =>
    sameDepartment(manager.department, department)
  );
}

async function getFinanceManagers() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('role', 'manager')
    .eq('status', 'active');

  if (error) throw error;

  return (data || []).filter((manager) =>
    sameDepartment(manager.department, 'Finance')
  );
}

function uniqueRecipients(list) {
  const map = new Map();

  for (const employee of list || []) {
    if (employee?.email) {
      map.set(String(employee.email).toLowerCase(), employee);
    }
  }

  return [...map.values()];
}

async function emailMany(recipients, payloadBuilder) {
  const unique = uniqueRecipients(recipients);

  const results = [];

  for (const employee of unique) {
    const payload = payloadBuilder(employee);

    const result = await sendNotificationEmail({
      employeeId: employee.id,
      to: employee.email,
      ...payload,
    });

    results.push(result);
  }

  return results;
}

// =========================
// LEAVE NOTIFICATIONS
// =========================

export async function notifyLeaveSubmitted(leaveRequest) {
  const applicant = await getEmployee(leaveRequest.employee_id);

  if (!applicant) return;

  const managers = await getManagersByDepartment(applicant.department);
  const admins = await getAdmins();

  const recipients = uniqueRecipients([
    ...managers.filter((manager) => manager.id !== applicant.id),
    ...admins,
  ]);

  return emailMany(recipients, () => ({
    subject: `Leave request pending - ${applicant.name}`,
    title: 'Leave request pending approval',
    message: `${applicant.name} submitted a ${leaveRequest.leave_type} request from ${leaveRequest.start_date} to ${leaveRequest.end_date}.`,
    link: '/leave',
    actionLabel: 'Review Leave',
  }));
}

export async function notifyLeaveDecision(leaveRequest) {
  const applicant = await getEmployee(leaveRequest.employee_id);

  if (!applicant?.email) return;

  return sendNotificationEmail({
    employeeId: applicant.id,
    to: applicant.email,
    subject: `Leave ${leaveRequest.status}`,
    title: `Your leave request was ${leaveRequest.status}`,
    message: `Your ${leaveRequest.leave_type} request from ${leaveRequest.start_date} to ${leaveRequest.end_date} was ${leaveRequest.status}.`,
    link: '/leave',
    actionLabel: 'View Leave',
  });
}

// =========================
// CLAIM NOTIFICATIONS
// =========================

export async function notifyClaimSubmitted(claim) {
  const applicant = await getEmployee(claim.employee_id);

  if (!applicant) return;

  const managers = await getManagersByDepartment(applicant.department);
  const admins = await getAdmins();

  const recipients = uniqueRecipients([
    ...managers.filter((manager) => manager.id !== applicant.id),
    ...admins,
  ]);

  return emailMany(recipients, () => ({
    subject: `Claim pending approval - ${applicant.name}`,
    title: 'Claim pending manager approval',
    message: `${applicant.name} submitted a ${claim.claim_type} claim for RM ${Number(
      claim.amount || 0
    ).toFixed(2)}.`,
    link: '/claims',
    actionLabel: 'Review Claim',
  }));
}

export async function notifyClaimPendingFinance(claim) {
  const applicant = await getEmployee(claim.employee_id);

  if (!applicant) return;

  const financeManagers = await getFinanceManagers();
  const admins = await getAdmins();

  const recipients = uniqueRecipients([...financeManagers, ...admins]);

  return emailMany(recipients, () => ({
    subject: `Claim pending finance approval - ${applicant.name}`,
    title: 'Claim pending finance approval',
    message: `${applicant.name}'s ${claim.claim_type} claim for RM ${Number(
      claim.amount || 0
    ).toFixed(2)} is pending Finance approval.`,
    link: '/claims',
    actionLabel: 'Review Claim',
  }));
}

export async function notifyClaimDecision(claim) {
  const applicant = await getEmployee(claim.employee_id);

  if (!applicant?.email) return;

  return sendNotificationEmail({
    employeeId: applicant.id,
    to: applicant.email,
    subject: `Claim ${claim.status}`,
    title: `Your claim was ${claim.status}`,
    message: `Your ${claim.claim_type} claim for RM ${Number(
      claim.amount || 0
    ).toFixed(2)} was ${claim.status}.`,
    link: '/claims',
    actionLabel: 'View Claim',
  });
}

// =========================
// PAYROLL NOTIFICATIONS
// =========================

export async function notifyPayslipReleased(payrollRecord) {
  const employee = await getEmployee(payrollRecord.employee_id);

  if (!employee?.email) return;

  return sendNotificationEmail({
    employeeId: employee.id,
    to: employee.email,
    subject: `Payslip available - ${payrollRecord.period}`,
    title: 'Your payslip is available',
    message: `Your payslip for ${payrollRecord.period} has been released. Please log in to WtecHR to download it.`,
    link: '/payroll',
    actionLabel: 'View Payslip',
  });
}