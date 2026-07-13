import * as XLSX from 'xlsx';

/**
 * Generic Excel exporter.
 * Converts an array of row objects into a downloadable .xlsx file.
 *
 * @param rows      Array of plain objects — keys become column headers
 * @param fileName  Download file name (without extension)
 * @param sheetName Sheet tab name inside the workbook
 */
export function exportToExcel(
  rows: Array<Record<string, string | number | null | undefined>>,
  fileName: string,
  sheetName = 'Sheet1'
) {
  if (!rows.length) return;

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Auto-size columns based on the longest value in each column
  const headers = Object.keys(rows[0]);
  worksheet['!cols'] = headers.map((h) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String(r[h] ?? '').length)
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

/** Only admins and managers may export org-wide reports. */
export function canExport(profile: { role?: string } | null | undefined): boolean {
  return profile?.role === 'admin' || profile?.role === 'manager';
}

/**
 * Scopes rows by role: admins/managers see everything,
 * employees only their own records. Works with rows keyed by
 * either `employee_id` (attendance, leave, payroll) or `id` (employees).
 */
export function scopeRows<T extends { employee_id?: number; id?: number }>(
  rows: T[],
  profile: { id: number; role?: string } | null | undefined,
  _getDept?: (r: T) => string | null | undefined
): T[] {
  if (!profile) return [];
  if (profile.role === 'admin' || profile.role === 'manager') return rows;
  return rows.filter((r) => (r.employee_id ?? r.id) === profile.id);
}

/** Formats an ISO timestamp as a readable time, e.g. "09:01 AM". */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Computes worked hours between check-in and check-out, e.g. "8.50". */
export function workedHours(checkIn: string | null | undefined, checkOut: string | null | undefined): string {
  if (!checkIn || !checkOut) return '—';
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms <= 0) return '—';
  return (ms / (1000 * 60 * 60)).toFixed(2);
}