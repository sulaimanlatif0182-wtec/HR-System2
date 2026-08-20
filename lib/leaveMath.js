export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function countWorkingLeaveDays(startDate, endDate, holidayMap = {}) {
  const current = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(current.getTime()) || Number.isNaN(last.getTime())) {
    return 0;
  }

  if (last < current) return 0;

  let total = 0;

  while (current <= last) {
    const key = dateKey(current);
    const holiday = holidayMap[key];
    const day = current.getDay();

    // Company rule: Monday-Saturday count, Sunday excluded.
    // Holiday excluded unless marked as working day.
    if (day !== 0 && (!holiday || holiday.is_working_day)) {
      total += 1;
    }

    current.setDate(current.getDate() + 1);
  }

  return total;
}

export function calculateTimeOffHours(start, end) {
  if (!start || !end) return 0;

  const [startHour, startMinute] = String(start).split(':').map(Number);
  const [endHour, endMinute] = String(end).split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const diffMinutes = endMinutes - startMinutes;

  if (diffMinutes <= 0) return 0;

  return Math.round((diffMinutes / 60) * 100) / 100;
}

export function computeLeaveBalance({
  entitlementDays = 0,
  adjustmentDays = 0,
  usedDays = 0,
} = {}) {
  return entitlementDays + adjustmentDays - usedDays;
}