import supabase from './db-client.js';

const PAYROLL_STATUSES = ['draft', 'reviewed', 'approved', 'released', 'paid'];

const BALANCE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Unpaid Leave',
  'Maternity/Paternity',
];

const OT_MULTIPLIER = 1.5;
const HOURS_PER_DAY = 8;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanString(value) {
  return String(value ?? '').trim();
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const DEFAULT_PAYROLL_SETTINGS = {
  id: 1,
  epf_enabled: true,
  epf_employee_rate_local_under60: 11,
  epf_employee_rate_local_60_above: 5.5,
  epf_employee_rate_foreign: 11,
  epf_employer_rate_under_5000: 13,
  epf_employer_rate_5000_above: 12,
  epf_employer_rate_60_above: 6.5,
  socso_enabled: true,
  socso_employee_rate: 0.5,
  socso_employer_rate: 1.75,
  socso_wage_cap: 5000,
  eis_enabled: true,
  eis_employee_rate: 0.2,
  eis_employer_rate: 0.2,
  eis_wage_cap: 5000,
  pcb_mode: 'manual_profile',
};

function normalizePayrollSettings(value = {}) {
  return {
    ...DEFAULT_PAYROLL_SETTINGS,
    ...(value || {}),
    epf_enabled: value?.epf_enabled ?? DEFAULT_PAYROLL_SETTINGS.epf_enabled,
    socso_enabled: value?.socso_enabled ?? DEFAULT_PAYROLL_SETTINGS.socso_enabled,
    eis_enabled: value?.eis_enabled ?? DEFAULT_PAYROLL_SETTINGS.eis_enabled,
    epf_employee_rate_local_under60: toNumber(
      value?.epf_employee_rate_local_under60,
      DEFAULT_PAYROLL_SETTINGS.epf_employee_rate_local_under60
    ),
    epf_employee_rate_local_60_above: toNumber(
      value?.epf_employee_rate_local_60_above,
      DEFAULT_PAYROLL_SETTINGS.epf_employee_rate_local_60_above
    ),
    epf_employee_rate_foreign: toNumber(
      value?.epf_employee_rate_foreign,
      DEFAULT_PAYROLL_SETTINGS.epf_employee_rate_foreign
    ),
    epf_employer_rate_under_5000: toNumber(
      value?.epf_employer_rate_under_5000,
      DEFAULT_PAYROLL_SETTINGS.epf_employer_rate_under_5000
    ),
    epf_employer_rate_5000_above: toNumber(
      value?.epf_employer_rate_5000_above,
      DEFAULT_PAYROLL_SETTINGS.epf_employer_rate_5000_above
    ),
    epf_employer_rate_60_above: toNumber(
      value?.epf_employer_rate_60_above,
      DEFAULT_PAYROLL_SETTINGS.epf_employer_rate_60_above
    ),
    socso_employee_rate: toNumber(
      value?.socso_employee_rate,
      DEFAULT_PAYROLL_SETTINGS.socso_employee_rate
    ),
    socso_employer_rate: toNumber(
      value?.socso_employer_rate,
      DEFAULT_PAYROLL_SETTINGS.socso_employer_rate
    ),
    socso_wage_cap: toNumber(
      value?.socso_wage_cap,
      DEFAULT_PAYROLL_SETTINGS.socso_wage_cap
    ),
    eis_employee_rate: toNumber(
      value?.eis_employee_rate,
      DEFAULT_PAYROLL_SETTINGS.eis_employee_rate
    ),
    eis_employer_rate: toNumber(
      value?.eis_employer_rate,
      DEFAULT_PAYROLL_SETTINGS.eis_employer_rate
    ),
    eis_wage_cap: toNumber(
      value?.eis_wage_cap,
      DEFAULT_PAYROLL_SETTINGS.eis_wage_cap
    ),
    pcb_mode: value?.pcb_mode || DEFAULT_PAYROLL_SETTINGS.pcb_mode,
  };
}

async function getPayrollSettings() {
  const { data, error } = await supabase
    .from('payroll_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) return DEFAULT_PAYROLL_SETTINGS;

  return normalizePayrollSettings(data || DEFAULT_PAYROLL_SETTINGS);
}

async function getPayrollProfiles() {
  const { data, error } = await supabase
    .from('payroll_employee_profiles')
    .select('*')
    .order('employee_id', { ascending: true });

  if (error) return [];

  return data || [];
}

async function getStatutoryWageTables() {
  const { data, error } = await supabase
    .from('statutory_wage_tables')
    .select('*')
    .eq('active', true)
    .order('scheme', { ascending: true })
    .order('wage_from', { ascending: true });

  if (error) return [];

  return data || [];
}

function findStatutoryWageTableRow(scheme, salary, wageTables = []) {
  const upperScheme = cleanString(scheme).toUpperCase();
  const wage = toNumber(salary);

  return (wageTables || []).find((row) => {
    if (cleanString(row.scheme).toUpperCase() !== upperScheme) return false;
    if (row.active === false) return false;

    const from = toNumber(row.wage_from);
    const to =
      row.wage_to === null || row.wage_to === undefined || row.wage_to === ''
        ? Number.POSITIVE_INFINITY
        : toNumber(row.wage_to);

    return wage >= from && wage <= to;
  });
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const dob = new Date(`${dateOfBirth}T00:00:00`);

  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age;
}

function rateToDecimal(rate) {
  return toNumber(rate) / 100;
}

function calculateStatutoryContributions(
  baseSalary,
  employee,
  settings,
  profile,
  wageTables = []
) {
  const salary = toNumber(baseSalary);
  const age = calculateAge(profile?.date_of_birth || employee?.date_of_birth);
  const citizenship = cleanString(profile?.citizenship_type || 'local').toLowerCase();
  const isAge60Above = age !== null && age >= 60;

  let epfEmployeeRate =
    citizenship === 'foreign'
      ? settings.epf_employee_rate_foreign
      : isAge60Above
        ? settings.epf_employee_rate_local_60_above
        : settings.epf_employee_rate_local_under60;

  let epfEmployerRate = isAge60Above
    ? settings.epf_employer_rate_60_above
    : salary <= 5000
      ? settings.epf_employer_rate_under_5000
      : settings.epf_employer_rate_5000_above;

  if (profile?.epf_employee_rate_override !== null && profile?.epf_employee_rate_override !== undefined) {
    epfEmployeeRate = toNumber(profile.epf_employee_rate_override, epfEmployeeRate);
  }

  if (profile?.epf_employer_rate_override !== null && profile?.epf_employer_rate_override !== undefined) {
    epfEmployerRate = toNumber(profile.epf_employer_rate_override, epfEmployerRate);
  }

  const socsoCategory = cleanString(profile?.socso_category || 'standard').toLowerCase();
  const socsoEnabled =
    settings.socso_enabled &&
    profile?.socso_enabled !== false &&
    socsoCategory !== 'not_applicable';
  const eisEnabled = settings.eis_enabled && profile?.eis_enabled !== false;
  const socsoWage = Math.min(salary, toNumber(settings.socso_wage_cap, 5000));
  const eisWage = Math.min(salary, toNumber(settings.eis_wage_cap, 5000));
  const socsoTableRow = socsoEnabled
    ? findStatutoryWageTableRow('SOCSO', salary, wageTables)
    : null;
  const eisTableRow = eisEnabled
    ? findStatutoryWageTableRow('EIS', salary, wageTables)
    : null;

  return {
    epf_employee: settings.epf_enabled
      ? roundMoney(salary * rateToDecimal(epfEmployeeRate))
      : 0,
    epf_employer: settings.epf_enabled
      ? roundMoney(salary * rateToDecimal(epfEmployerRate))
      : 0,
    socso_employee: socsoEnabled
      ? roundMoney(
          socsoTableRow
            ? socsoTableRow.employee_amount
            : socsoWage * rateToDecimal(settings.socso_employee_rate)
        )
      : 0,
    socso_employer: socsoEnabled
      ? roundMoney(
          socsoTableRow
            ? socsoTableRow.employer_amount
            : socsoWage * rateToDecimal(settings.socso_employer_rate)
        )
      : 0,
    eis_employee: eisEnabled
      ? roundMoney(
          eisTableRow
            ? eisTableRow.employee_amount
            : eisWage * rateToDecimal(settings.eis_employee_rate)
        )
      : 0,
    eis_employer: eisEnabled
      ? roundMoney(
          eisTableRow
            ? eisTableRow.employer_amount
            : eisWage * rateToDecimal(settings.eis_employer_rate)
        )
      : 0,
    pcb: roundMoney(profile?.pcb_monthly_amount || 0),
    age,
    citizenship_type: citizenship || 'local',
    socso_source: socsoTableRow ? 'table' : 'fallback_rate',
    eis_source: eisTableRow ? 'table' : 'fallback_rate',
  };
}

function getPeriodRange(period) {
  const [yearRaw, monthRaw] = String(period).split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!year || !month) {
    throw new Error('Invalid payroll period. Use YYYY-MM format.');
  }

  const end = new Date(Date.UTC(year, month, 0));
  const daysInMonth = end.getUTCDate();

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(
    daysInMonth
  ).padStart(2, '0')}`;

  return {
    year,
    month,
    startDate,
    endDate,
    daysInMonth,
  };
}

function calculatePayrollTotals(row) {
  const baseSalary = toNumber(row.base_salary);
  const bonus = toNumber(row.bonus);
  const otPay = toNumber(row.ot_pay);
  const claimAmount = toNumber(row.claim_amount);

  const leaveDeduction = toNumber(row.leave_deduction);
  const lunchDeduction = toNumber(row.lunch_deduction);
  const deductions = toNumber(row.deductions);
  const epfEmployee = toNumber(row.epf_employee);
  const socsoEmployee = toNumber(row.socso_employee);
  const eisEmployee = toNumber(row.eis_employee);
  const pcb = toNumber(row.pcb);

  const grossPay =
    row.gross_pay !== undefined && row.gross_pay !== null && row.gross_pay !== ''
      ? toNumber(row.gross_pay)
      : baseSalary + bonus + otPay + claimAmount;

  const totalDeductions =
    deductions +
    leaveDeduction +
    lunchDeduction +
    epfEmployee +
    socsoEmployee +
    eisEmployee +
    pcb;

  const netPay =
    row.net_pay !== undefined && row.net_pay !== null && row.net_pay !== ''
      ? toNumber(row.net_pay)
      : grossPay - totalDeductions;

  return {
    gross_pay: roundMoney(grossPay),
    net_pay: roundMoney(netPay),
  };
}

async function getEmployeeFromImportRow(row) {
  const employeeId = row.employee_id || row.Employee_ID;
  const employeeEmail =
    row.employee_email ||
    row.Employee_Email ||
    row.email ||
    row.Email ||
    row.employeeEmail;

  if (employeeId) {
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, email, department')
      .eq('id', Number(employeeId))
      .maybeSingle();

    if (error) throw error;

    return data;
  }

  if (employeeEmail) {
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, email, department')
      .ilike('email', cleanString(employeeEmail))
      .maybeSingle();

    if (error) throw error;

    return data;
  }

  return null;
}

function normalizePayrollPayload(input) {
  const status = cleanString(input.status || 'draft').toLowerCase();

  const payload = {
    employee_id: Number(input.employee_id),
    period: cleanString(input.period),
    base_salary: toNumber(input.base_salary),
    bonus: toNumber(input.bonus),
    deductions: toNumber(input.deductions),
    status: PAYROLL_STATUSES.includes(status) ? status : 'draft',

    gross_pay: toNumber(input.gross_pay),
    ot_hours: toNumber(input.ot_hours),
    ot_rate: toNumber(input.ot_rate),
    ot_pay: toNumber(input.ot_pay),
    claim_amount: toNumber(input.claim_amount),

    leave_deduction: toNumber(input.leave_deduction),
    unpaid_leave_days: toNumber(input.unpaid_leave_days),
    lunch_late_minutes: toNumber(input.lunch_late_minutes),
    lunch_deduction: toNumber(input.lunch_deduction),

    epf_employee: toNumber(input.epf_employee),
    epf_employer: toNumber(input.epf_employer),
    socso_employee: toNumber(input.socso_employee),
    socso_employer: toNumber(input.socso_employer),
    eis_employee: toNumber(input.eis_employee),
    eis_employer: toNumber(input.eis_employer),
    pcb: toNumber(input.pcb),

    batch_id: input.batch_id ? Number(input.batch_id) : null,
    remarks: input.remarks || null,
  };

  const totals = calculatePayrollTotals(payload);

  payload.gross_pay = totals.gross_pay;
  payload.net_pay = totals.net_pay;

  return payload;
}

async function getOrCreateBatch(period) {
  const cleanPeriod = cleanString(period);

  if (!cleanPeriod) {
    throw new Error('Payroll period is required.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('payroll_batches')
    .select('*')
    .eq('period', cleanPeriod)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) return existing;

  const { data, error } = await supabase
    .from('payroll_batches')
    .insert({
      period: cleanPeriod,
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function recomputeBatch(period) {
  const cleanPeriod = cleanString(period);

  if (!cleanPeriod) return null;

  const { data: rows, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('period', cleanPeriod);

  if (error) throw error;

  const list = rows || [];

  const summary = list.reduce(
    (acc, row) => {
      acc.total_gross += toNumber(row.gross_pay);
      acc.total_net += toNumber(row.net_pay);
      acc.total_epf_employee += toNumber(row.epf_employee);
      acc.total_epf_employer += toNumber(row.epf_employer);
      acc.total_socso_employee += toNumber(row.socso_employee);
      acc.total_socso_employer += toNumber(row.socso_employer);
      acc.total_eis_employee += toNumber(row.eis_employee);
      acc.total_eis_employer += toNumber(row.eis_employer);
      acc.total_pcb += toNumber(row.pcb);
      acc.total_claims += toNumber(row.claim_amount);
      acc.total_ot += toNumber(row.ot_pay);
      acc.total_lunch_deduction += toNumber(row.lunch_deduction);

      acc.total_deductions +=
        toNumber(row.deductions) +
        toNumber(row.leave_deduction) +
        toNumber(row.lunch_deduction) +
        toNumber(row.epf_employee) +
        toNumber(row.socso_employee) +
        toNumber(row.eis_employee) +
        toNumber(row.pcb);

      return acc;
    },
    {
      total_gross: 0,
      total_net: 0,
      total_epf_employee: 0,
      total_epf_employer: 0,
      total_socso_employee: 0,
      total_socso_employer: 0,
      total_eis_employee: 0,
      total_eis_employer: 0,
      total_pcb: 0,
      total_claims: 0,
      total_ot: 0,
      total_deductions: 0,
      total_lunch_deduction: 0,
    }
  );

  const batch = await getOrCreateBatch(cleanPeriod);

  const { data, error: updateError } = await supabase
    .from('payroll_batches')
    .update(summary)
    .eq('id', batch.id)
    .select()
    .single();

  if (updateError) throw updateError;

  return data;
}

async function getExistingPayroll(employeeId, period) {
  const { data, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('period', period)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

async function getAttendanceOtHours(employeeId, startDate, endDate) {
  const { data, error } = await supabase
    .from('attendance')
    .select('overtime_hours')
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw error;

  return (data || []).reduce(
    (sum, row) => sum + toNumber(row.overtime_hours),
    0
  );
}

async function getAttendanceLunchLateMinutes(employeeId, startDate, endDate) {
  const { data, error } = await supabase
    .from('attendance')
    .select('lunch_late_minutes')
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw error;

  return (data || []).reduce(
    (sum, row) => sum + toNumber(row.lunch_late_minutes),
    0
  );
}

async function getApprovedLeaveRows(employeeId) {
  const { data, error } = await supabase
    .from('leave_requests')
    .select(
      'id, employee_id, leave_type, start_date, end_date, days, status, request_mode, time_off_date, time_off_hours'
    )
    .eq('employee_id', employeeId)
    .eq('status', 'approved');

  if (error) throw error;

  return data || [];
}

async function getLeaveEntitlements(employeeId) {
  const { data, error } = await supabase
    .from('leave_balances')
    .select('leave_type, entitlement_days')
    .eq('employee_id', employeeId);

  if (error) throw error;

  const map = {};

  (data || []).forEach((row) => {
    map[row.leave_type] = toNumber(row.entitlement_days);
  });

  return map;
}

async function getApprovedClaimsForPeriod(employeeId, startDate, endDate) {
  const { data, error } = await supabase
    .from('claims')
    .select(
      'id, amount, claim_type, claim_date, status, included_in_payroll, payroll_period'
    )
    .eq('employee_id', employeeId)
    .eq('status', 'approved')
    .gte('claim_date', startDate)
    .lte('claim_date', endDate);

  if (error) throw error;

  const claims = data || [];
  const total = claims.reduce((sum, claim) => sum + toNumber(claim.amount), 0);

  return {
    claims,
    total: roundMoney(total),
  };
}

async function markClaimsIncluded(claims, period) {
  const ids = (claims || []).map((claim) => claim.id).filter(Boolean);

  if (!ids.length) return;

  const { error } = await supabase
    .from('claims')
    .update({
      included_in_payroll: true,
      payroll_period: period,
    })
    .in('id', ids);

  if (error) throw error;
}

function isDateBefore(date, compareDate) {
  return String(date || '') < String(compareDate || '');
}

function isDateWithin(date, startDate, endDate) {
  return String(date || '') >= startDate && String(date || '') <= endDate;
}

function calculateLeaveDeductions({
  leaveRows,
  entitlements,
  startDate,
  endDate,
  dailyRate,
  hourlyRate,
}) {
  let unpaidLeaveDays = 0;
  let negativeLeaveDays = 0;
  let timeOffHours = 0;

  const leaveTypesForNegative = BALANCE_TYPES.filter(
    (type) => type !== 'Unpaid Leave'
  );

  const rowsByType = {};

  leaveRows.forEach((row) => {
    const leaveType = row.leave_type;

    if (!rowsByType[leaveType]) {
      rowsByType[leaveType] = [];
    }

    rowsByType[leaveType].push(row);
  });

  const currentPeriodRows = leaveRows.filter((row) => {
    const date = row.request_mode === 'time_off' ? row.time_off_date : row.start_date;

    return isDateWithin(date, startDate, endDate);
  });

  currentPeriodRows.forEach((row) => {
    if (row.leave_type === 'Unpaid Leave') {
      unpaidLeaveDays += toNumber(row.days);
    }

    if (row.request_mode === 'time_off' || row.leave_type === 'Time Off') {
      timeOffHours += toNumber(row.time_off_hours);
    }
  });

  leaveTypesForNegative.forEach((leaveType) => {
    const entitlement = toNumber(entitlements[leaveType]);
    const rows = rowsByType[leaveType] || [];

    const usedBefore = rows
      .filter((row) => isDateBefore(row.start_date, startDate))
      .reduce((sum, row) => sum + toNumber(row.days), 0);

    const usedThisPeriod = rows
      .filter((row) => isDateWithin(row.start_date, startDate, endDate))
      .reduce((sum, row) => sum + toNumber(row.days), 0);

    const balanceBefore = entitlement - usedBefore;
    const freeDaysRemaining = Math.max(balanceBefore, 0);
    const overusedThisPeriod = Math.max(usedThisPeriod - freeDaysRemaining, 0);

    negativeLeaveDays += overusedThisPeriod;
  });

  const unpaidLeaveDeduction = unpaidLeaveDays * dailyRate;
  const negativeLeaveDeduction = negativeLeaveDays * dailyRate;
  const timeOffDeduction = timeOffHours * hourlyRate;

  return {
    unpaidLeaveDays: roundMoney(unpaidLeaveDays),
    negativeLeaveDays: roundMoney(negativeLeaveDays),
    timeOffHours: roundMoney(timeOffHours),
    leaveDeduction: roundMoney(
      unpaidLeaveDeduction + negativeLeaveDeduction + timeOffDeduction
    ),
  };
}

function payrollSettingsPayloadFromBody(body = {}) {
  return {
    id: 1,
    epf_enabled: body.epf_enabled !== false,
    epf_employee_rate_local_under60: toNumber(body.epf_employee_rate_local_under60, 11),
    epf_employee_rate_local_60_above: toNumber(body.epf_employee_rate_local_60_above, 5.5),
    epf_employee_rate_foreign: toNumber(body.epf_employee_rate_foreign, 11),
    epf_employer_rate_under_5000: toNumber(body.epf_employer_rate_under_5000, 13),
    epf_employer_rate_5000_above: toNumber(body.epf_employer_rate_5000_above, 12),
    epf_employer_rate_60_above: toNumber(body.epf_employer_rate_60_above, 6.5),
    socso_enabled: body.socso_enabled !== false,
    socso_employee_rate: toNumber(body.socso_employee_rate, 0.5),
    socso_employer_rate: toNumber(body.socso_employer_rate, 1.75),
    socso_wage_cap: toNumber(body.socso_wage_cap, 5000),
    eis_enabled: body.eis_enabled !== false,
    eis_employee_rate: toNumber(body.eis_employee_rate, 0.2),
    eis_employer_rate: toNumber(body.eis_employer_rate, 0.2),
    eis_wage_cap: toNumber(body.eis_wage_cap, 5000),
    pcb_mode: body.pcb_mode || 'manual_profile',
    updated_by: body.updated_by || body.changed_by || null,
    updated_by_name: body.updated_by_name || body.changed_by_name || null,
    updated_at: new Date().toISOString(),
  };
}

function payrollProfilePayloadFromBody(body = {}) {
  return {
    employee_id: Number(body.employee_id),
    citizenship_type: body.citizenship_type || 'local',
    date_of_birth: body.date_of_birth || null,
    epf_employee_rate_override:
      body.epf_employee_rate_override === '' || body.epf_employee_rate_override === null || body.epf_employee_rate_override === undefined
        ? null
        : toNumber(body.epf_employee_rate_override),
    epf_employer_rate_override:
      body.epf_employer_rate_override === '' || body.epf_employer_rate_override === null || body.epf_employer_rate_override === undefined
        ? null
        : toNumber(body.epf_employer_rate_override),
    socso_category: body.socso_category || 'standard',
    socso_enabled: body.socso_enabled !== false,
    eis_enabled: body.eis_enabled !== false,
    pcb_monthly_amount: toNumber(body.pcb_monthly_amount),
    pcb_notes: body.pcb_notes || null,
    updated_by: body.updated_by || body.changed_by || null,
    updated_by_name: body.updated_by_name || body.changed_by_name || null,
    updated_at: new Date().toISOString(),
  };
}

function wageTablePayloadFromBody(body = {}) {
  const scheme = cleanString(body.scheme).toUpperCase();

  return {
    scheme: scheme === 'EIS' ? 'EIS' : 'SOCSO',
    wage_from: toNumber(body.wage_from),
    wage_to:
      body.wage_to === null || body.wage_to === undefined || body.wage_to === ''
        ? null
        : toNumber(body.wage_to),
    employee_amount: toNumber(body.employee_amount),
    employer_amount: toNumber(body.employer_amount),
    effective_from: body.effective_from || null,
    effective_to: body.effective_to || null,
    active: body.active !== false,
    notes: body.notes || null,
    updated_by: body.updated_by || body.changed_by || null,
    updated_by_name: body.updated_by_name || body.changed_by_name || null,
    updated_at: new Date().toISOString(),
  };
}

async function generatePayrollFromSources(period) {
  const { startDate, endDate, daysInMonth } = getPeriodRange(period);
  const batch = await getOrCreateBatch(period);
  const payrollSettings = await getPayrollSettings();
  const profileRows = await getPayrollProfiles();
  const statutoryWageTables = await getStatutoryWageTables();
  const payrollProfileMap = new Map(
    profileRows.map((row) => [Number(row.employee_id), row])
  );

  const { data: employees, error: employeeError } = await supabase
    .from('employees')
    .select('id, name, email, department, salary, status, date_of_birth')
    .neq('status', 'inactive')
    .order('id', { ascending: true });

  if (employeeError) throw employeeError;

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const employee of employees || []) {
    try {
      const existing = await getExistingPayroll(employee.id, period);

      if (existing && ['released', 'paid'].includes(existing.status)) {
        results.skipped += 1;
        results.errors.push(
          `${employee.name}: skipped because payroll is already ${existing.status}.`
        );
        continue;
      }

      const baseSalary =
        existing?.base_salary !== undefined &&
        existing?.base_salary !== null &&
        Number(existing.base_salary) > 0
          ? toNumber(existing.base_salary)
          : toNumber(employee.salary);

      if (!baseSalary) {
        results.skipped += 1;
        results.errors.push(
          `${employee.name}: skipped because employee salary is empty.`
        );
        continue;
      }

      const dailyRate = baseSalary / daysInMonth;
      const hourlyRate = dailyRate / 8;

      const otHours = await getAttendanceOtHours(
        employee.id,
        startDate,
        endDate
      );

      const lunchLateMinutes = await getAttendanceLunchLateMinutes(
        employee.id,
        startDate,
        endDate
      );

      const otRate = hourlyRate * OT_MULTIPLIER;
      const otPay = otHours * otRate;

      const lunchDeduction = (lunchLateMinutes / 60) * hourlyRate;

      const leaveRows = await getApprovedLeaveRows(employee.id);
      const entitlements = await getLeaveEntitlements(employee.id);

      const leaveResult = calculateLeaveDeductions({
        leaveRows,
        entitlements,
        startDate,
        endDate,
        dailyRate,
        hourlyRate,
      });

      const claimsResult = await getApprovedClaimsForPeriod(
        employee.id,
        startDate,
        endDate
      );

      const bonus = toNumber(existing?.bonus);
      const deductions = toNumber(existing?.deductions);

      const claimAmount = toNumber(claimsResult.total);

      const payrollProfile = payrollProfileMap.get(Number(employee.id));
      const statutory = calculateStatutoryContributions(
        baseSalary,
        employee,
        payrollSettings,
        payrollProfile,
        statutoryWageTables
      );
      const epfEmployee = statutory.epf_employee;
      const epfEmployer = statutory.epf_employer;
      const socsoEmployee = statutory.socso_employee;
      const socsoEmployer = statutory.socso_employer;
      const eisEmployee = statutory.eis_employee;
      const eisEmployer = statutory.eis_employer;
      const pcb =
        existing?.pcb !== undefined && existing?.pcb !== null
          ? toNumber(existing.pcb)
          : statutory.pcb;

      const grossPay = baseSalary + bonus + otPay + claimAmount;

      const totalDeductions =
        deductions +
        leaveResult.leaveDeduction +
        lunchDeduction +
        epfEmployee +
        socsoEmployee +
        eisEmployee +
        pcb;

      const netPay = grossPay - totalDeductions;

      const payload = {
        employee_id: employee.id,
        period,
        batch_id: batch.id,
        base_salary: roundMoney(baseSalary),
        bonus: roundMoney(bonus),
        deductions: roundMoney(deductions),

        gross_pay: roundMoney(grossPay),
        ot_hours: roundMoney(otHours),
        ot_rate: roundMoney(otRate),
        ot_pay: roundMoney(otPay),

        claim_amount: roundMoney(claimAmount),
        leave_deduction: roundMoney(leaveResult.leaveDeduction),
        unpaid_leave_days: roundMoney(
          leaveResult.unpaidLeaveDays + leaveResult.negativeLeaveDays
        ),

        lunch_late_minutes: roundMoney(lunchLateMinutes),
        lunch_deduction: roundMoney(lunchDeduction),

        epf_employee: roundMoney(epfEmployee),
        epf_employer: roundMoney(epfEmployer),
        socso_employee: roundMoney(socsoEmployee),
        socso_employer: roundMoney(socsoEmployer),
        eis_employee: roundMoney(eisEmployee),
        eis_employer: roundMoney(eisEmployer),
        pcb: roundMoney(pcb),

        net_pay: roundMoney(netPay),
        status: existing?.status || 'draft',
        remarks: [
          existing?.remarks || '',
          `Auto-generated from attendance/leave/claims/lunch. OT ${roundMoney(
            otHours
          )}h. Claims RM ${roundMoney(
            claimAmount
          )}. Leave deduction RM ${roundMoney(
            leaveResult.leaveDeduction
          )}. Lunch late ${roundMoney(
            lunchLateMinutes
          )} min, lunch deduction RM ${roundMoney(lunchDeduction)}.`,
        ]
          .filter(Boolean)
          .join('\n'),
      };

      if (existing) {
        const { error } = await supabase
          .from('payroll')
          .update(payload)
          .eq('id', existing.id);

        if (error) throw error;

        results.updated += 1;
      } else {
        const { error } = await supabase.from('payroll').insert(payload);

        if (error) throw error;

        results.created += 1;
      }

      await markClaimsIncluded(claimsResult.claims, period);
    } catch (err) {
      results.skipped += 1;
      results.errors.push(
        `${employee.name}: ${err instanceof Error ? err.message : 'failed'}`
      );
    }
  }

  const summary = await recomputeBatch(period);

  return {
    ...results,
    batch: summary,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const {
        employee_id,
        period,
        batches,
        settings,
        profiles,
        profile_employee_id,
        wage_tables,
        scheme,
      } = req.query;

      if (settings === 'true') {
        const payrollSettings = await getPayrollSettings();

        return res.status(200).json(payrollSettings);
      }

      if (profiles === 'true') {
        let query = supabase
          .from('payroll_employee_profiles')
          .select('*')
          .order('employee_id', { ascending: true });

        if (profile_employee_id) {
          query = query.eq('employee_id', Number(profile_employee_id));
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.status(200).json(data || []);
      }

      if (wage_tables === 'true') {
        let query = supabase
          .from('statutory_wage_tables')
          .select('*')
          .order('scheme', { ascending: true })
          .order('wage_from', { ascending: true });

        if (scheme) {
          query = query.eq('scheme', cleanString(scheme).toUpperCase());
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.status(200).json(data || []);
      }

      if (batches === 'true') {
        const { data, error } = await supabase
          .from('payroll_batches')
          .select('*')
          .order('period', { ascending: false });

        if (error) throw error;

        return res.status(200).json(data || []);
      }

      let query = supabase
        .from('payroll')
        .select('*')
        .order('id', { ascending: false });

      if (employee_id) query = query.eq('employee_id', employee_id);
      if (period) query = query.eq('period', period);

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      if (action === 'save_settings') {
        const payload = payrollSettingsPayloadFromBody(body);

        const { data, error } = await supabase
          .from('payroll_settings')
          .upsert(payload, { onConflict: 'id' })
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(normalizePayrollSettings(data));
      }

      if (action === 'save_profile') {
        if (!body.employee_id) {
          return res.status(400).json({
            error: 'employee_id is required.',
          });
        }

        const payload = payrollProfilePayloadFromBody(body);

        const { data, error } = await supabase
          .from('payroll_employee_profiles')
          .upsert(payload, { onConflict: 'employee_id' })
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      if (action === 'save_wage_table') {
        const payload = wageTablePayloadFromBody(body);

        if (body.id) {
          const { data, error } = await supabase
            .from('statutory_wage_tables')
            .update(payload)
            .eq('id', Number(body.id))
            .select()
            .single();

          if (error) throw error;

          return res.status(200).json(data);
        }

        const { data, error } = await supabase
          .from('statutory_wage_tables')
          .insert({
            ...payload,
            created_by: body.created_by || body.changed_by || null,
            created_by_name: body.created_by_name || body.changed_by_name || null,
          })
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json(data);
      }

      if (action === 'delete_wage_table') {
        if (!body.id) {
          return res.status(400).json({ error: 'id is required.' });
        }

        const { error } = await supabase
          .from('statutory_wage_tables')
          .delete()
          .eq('id', Number(body.id));

        if (error) throw error;

        return res.status(200).json({ ok: true });
      }

      if (action === 'create_batch') {
        const batch = await getOrCreateBatch(body.period);
        const summary = await recomputeBatch(body.period);

        return res.status(201).json(summary || batch);
      }

      if (action === 'generate_from_sources') {
        if (!body.period) {
          return res.status(400).json({
            error: 'period is required.',
          });
        }

        const result = await generatePayrollFromSources(body.period);

        return res.status(200).json(result);
      }

      if (action === 'import_records') {
        const period = cleanString(body.period);
        const rows = Array.isArray(body.rows) ? body.rows : [];

        if (!period) {
          return res.status(400).json({ error: 'period is required.' });
        }

        if (!rows.length) {
          return res.status(400).json({ error: 'No rows to import.' });
        }

        const batch = await getOrCreateBatch(period);

        const results = {
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: [],
        };

        for (let i = 0; i < rows.length; i++) {
          try {
            const row = rows[i];
            const employee = await getEmployeeFromImportRow(row);

            if (!employee) {
              results.skipped += 1;
              results.errors.push(`Row ${i + 1}: employee not found.`);
              continue;
            }

            const payload = normalizePayrollPayload({
              employee_id: employee.id,
              period,
              base_salary: row.base_salary || row.Base_Salary,
              bonus: row.bonus || row.Bonus,
              deductions: row.deductions || row.Deductions,
              gross_pay: row.gross_pay || row.Gross_Pay,
              ot_hours: row.ot_hours || row.OT_Hours,
              ot_rate: row.ot_rate || row.OT_Rate,
              ot_pay: row.ot_pay || row.OT_Pay,
              claim_amount: row.claim_amount || row.Claim_Amount,
              leave_deduction: row.leave_deduction || row.Leave_Deduction,
              unpaid_leave_days: row.unpaid_leave_days || row.Unpaid_Leave_Days,
              lunch_late_minutes: row.lunch_late_minutes || row.Lunch_Late_Minutes,
              lunch_deduction: row.lunch_deduction || row.Lunch_Deduction,
              epf_employee: row.epf_employee || row.EPF_Employee,
              epf_employer: row.epf_employer || row.EPF_Employer,
              socso_employee: row.socso_employee || row.SOCSO_Employee,
              socso_employer: row.socso_employer || row.SOCSO_Employer,
              eis_employee: row.eis_employee || row.EIS_Employee,
              eis_employer: row.eis_employer || row.EIS_Employer,
              pcb: row.pcb || row.PCB,
              net_pay: row.net_pay || row.Net_Pay,
              status: row.status || row.Status || 'draft',
              remarks: row.remarks || row.Remarks,
              batch_id: batch.id,
            });

            const { data: existing, error: existingError } = await supabase
              .from('payroll')
              .select('id')
              .eq('employee_id', employee.id)
              .eq('period', period)
              .limit(1)
              .maybeSingle();

            if (existingError) throw existingError;

            if (existing) {
              const { error } = await supabase
                .from('payroll')
                .update(payload)
                .eq('id', existing.id);

              if (error) throw error;

              results.updated += 1;
            } else {
              const { error } = await supabase.from('payroll').insert(payload);

              if (error) throw error;

              results.inserted += 1;
            }
          } catch (err) {
            results.skipped += 1;
            results.errors.push(
              `Row ${i + 1}: ${
                err instanceof Error ? err.message : 'Import failed'
              }`
            );
          }
        }

        const summary = await recomputeBatch(period);

        return res.status(200).json({
          ...results,
          batch: summary,
        });
      }

      const payload = normalizePayrollPayload(body);

      if (!payload.employee_id || !payload.period) {
        return res.status(400).json({
          error: 'employee_id and period are required.',
        });
      }

      const batch = await getOrCreateBatch(payload.period);

      payload.batch_id = batch.id;

      const { data, error } = await supabase
        .from('payroll')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      await recomputeBatch(payload.period);

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const action = body.action;

      if (action === 'approve_batch') {
        const period = cleanString(body.period);

        if (!period) {
          return res.status(400).json({ error: 'period is required.' });
        }

        const batch = await getOrCreateBatch(period);

        await supabase
          .from('payroll')
          .update({
            status: 'approved',
            approved_by: body.approved_by || null,
            approved_at: new Date().toISOString(),
          })
          .eq('period', period);

        const { data, error } = await supabase
          .from('payroll_batches')
          .update({
            status: 'approved',
            approved_by: body.approved_by || null,
            approved_at: new Date().toISOString(),
          })
          .eq('id', batch.id)
          .select()
          .single();

        if (error) throw error;

        const summary = await recomputeBatch(period);

        return res.status(200).json(summary || data);
      }

      if (action === 'release_batch') {
        const period = cleanString(body.period);

        if (!period) {
          return res.status(400).json({ error: 'period is required.' });
        }

        const batch = await getOrCreateBatch(period);
        const releasedAt = new Date().toISOString();

        await supabase
          .from('payroll')
          .update({
            status: 'released',
            released_at: releasedAt,
          })
          .eq('period', period);

        const { data, error } = await supabase
          .from('payroll_batches')
          .update({
            status: 'released',
            released_by: body.released_by || null,
            released_at: releasedAt,
          })
          .eq('id', batch.id)
          .select()
          .single();

        if (error) throw error;

        const summary = await recomputeBatch(period);

        return res.status(200).json(summary || data);
      }

      const { id, ...rest } = body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const payload = normalizePayrollPayload(rest);

      const { data: existing, error: existingError } = await supabase
        .from('payroll')
        .select('period, batch_id')
        .eq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;

      const { data, error } = await supabase
        .from('payroll')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await recomputeBatch(payload.period || existing?.period);

      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};

      if (!id) {
        return res.status(400).json({ error: 'id is required.' });
      }

      const { data: existing, error: existingError } = await supabase
        .from('payroll')
        .select('period')
        .eq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;

      const { error } = await supabase.from('payroll').delete().eq('id', id);

      if (error) throw error;

      if (existing?.period) {
        await recomputeBatch(existing.period);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);

    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error.',
    });
  }
}