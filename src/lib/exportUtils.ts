import * as XLSX from 'xlsx';

/**
 * Export multiple named datasets into a single Excel workbook.
 * Each entry becomes its own sheet.
 */
export function exportToExcel(
  fileName: string,
  sheets: Array<{ name: string; rows: Record<string, unknown>[] }>
) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]);
    // Auto-size columns based on content
    const keys = rows.length ? Object.keys(rows[0]) : ['Note'];
    ws['!cols'] = keys.map((k) => ({
      wch: Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)) + 2,
    }));
    // Sheet names: max 31 chars
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

/**
 * Export a single dataset as a CSV file download.
 */
export function exportToCSV(fileName: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}