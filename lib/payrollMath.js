export const BALANCE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Unpaid Leave',
  'Maternity/Paternity',
  'EL',
];

export const OT_MULTIPLIER = 1.5;
export const HOURS_PER_DAY = 8;

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function isDateBefore(date, compareDate) {
  return String(date || '') < String(compareDate || '');
}

export function isDateWithin(date, startDate, endDate) {
  return String(date || '') >= startDate && String(date || '') <= endDate;
}

export function findStatutoryWageTableRow(scheme, salary, wageTables = []) {
  const upperScheme = String(scheme || '').trim().toUpperCase();
  const wage = toNumber(salary);

  return (wageTables || []).find((row) => {
    if (String(row.scheme || '').trim().toUpperCase() !== upperScheme) return false;
    if (row.active === false) return false;

    const from = toNumber(row.wage_from);
    const to =
      row.wage_to === null || row.wage_to === undefined || row.wage_to === ''
        ? Number.POSITIVE_INFINITY
        : toNumber(row.wage_to);

    return wage >= from && wage <= to;
  });
}

export function calculateAge(dateOfBirth) {
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

export function rateToDecimal(rate) {
  return toNumber(rate) / 100;
}

export function calculateStatutoryContributions(
  baseSalary,
  employee,
  settings,
  profile,
  wageTables = []
) {
  const salary = toNumber(baseSalary);
  const age = calculateAge(profile?.date_of_birth || employee?.date_of_birth);
  const citizenship = String(profile?.citizenship_type || 'local')
    .toLowerCase();
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

  const socsoCategory = String(profile?.socso_category || 'standard').toLowerCase();
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

export function calculatePayrollTotals(row) {
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

export function calculateLeaveDeductions({
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