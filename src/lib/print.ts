export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface PrintDocumentOptions {
  title: string;
  docTitle?: string;
  subtitle?: string;
  header?: boolean;
  bodyHtml: string;
}

let activePrintWindow: Window | null = null;

const PRINT_STYLES = `
  @page { size: A4; margin: 12mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.45; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid #1f4fa3; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { max-height: 70px; max-width: 260px; object-fit: contain; }
  h1 { margin: 0; color: #1f4fa3; font-size: 24px; }
  .header-sub { font-size: 12px; color: #6b7280; }
  h2 { margin-top: 24px; font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #f8fafc; }
  .label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
  .value { font-weight: bold; white-space: pre-wrap; }
  .section { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
  .letter-body { white-space: pre-wrap; font-size: 14px; }
  .signature { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; margin-top: 60px; }
  .signature-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; }
  .line { border-top: 1px solid #111827; padding-top: 8px; font-size: 12px; }
  .muted { color: #6b7280; font-size: 12px; }
  @media print { body { margin: 0; padding: 0; } }
`;

export function printDocument(options: PrintDocumentOptions): void {
  const { title, docTitle, subtitle, header = true, bodyHtml } = options;

  if (activePrintWindow && !activePrintWindow.closed) {
    activePrintWindow.close();
  }

  const printWindow = window.open('', '_blank', 'width=1000,height=800');

  if (!printWindow) {
    alert('Popup blocked. Please allow popups to print.');
    return;
  }

  const headerHtml = header
    ? `
    <div class="header">
      <img class="logo" src="/profile_logo.png" />
      <div style="text-align:right">
        <h1>${escapeHtml(docTitle || title)}</h1>
        ${subtitle ? `<div class="header-sub">${escapeHtml(subtitle)}</div>` : ''}
        <div class="header-sub">Printed: ${escapeHtml(new Date().toLocaleString())}</div>
      </div>
    </div>`
    : '';

  const html = `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        ${headerHtml}
        ${bodyHtml}
      </body>
    </html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  activePrintWindow = printWindow;
}
