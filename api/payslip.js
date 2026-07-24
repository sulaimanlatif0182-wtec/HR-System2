import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import supabase from './db-client.js';

const BRAND_BLUE = '#1f4fa3';
const BRAND_RED = '#dc1828';
const DARK = '#111827';
const MUTED = '#6b7280';
const LIGHT_BORDER = '#e5e7eb';
const LIGHT_BG = '#f8fafc';

function money(value) {
  return `RM ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value) {
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

function makePassword(dateOfBirth, identityLast4) {
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

function getLogoPath() {
  const candidates = [
    path.join(process.cwd(), 'public', 'profile_logo.png'),
    path.join(process.cwd(), 'profile_logo.png'),
    path.join('/tmp', 'profile_logo.png'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function drawPageHeader(doc, payroll) {
  const logoPath = getLogoPath();

  doc.save();
  doc.rect(0, 0, doc.page.width, 112).fill('#ffffff');
  doc.rect(0, 108, doc.page.width, 4).fill(BRAND_BLUE);
  doc.rect(0, 112, doc.page.width, 2).fill(BRAND_RED);

  if (logoPath) {
    try {
      doc.image(logoPath, 36, 28, {
        width: 210,
        height: 62,
        fit: [210, 62],
        align: 'left',
        valign: 'center',
      });
    } catch {
      doc
        .font('Helvetica-Bold')
        .fontSize(28)
        .fillColor(BRAND_BLUE)
        .text('WTEC', 36, 42);
    }
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(BRAND_BLUE)
      .text('WTEC', 36, 42);
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(DARK)
    .text('CONFIDENTIAL PAYSLIP', 335, 34, {
      width: 220,
      align: 'right',
    });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text('Human Resource Department', 335, 58, {
      width: 220,
      align: 'right',
    })
    .text(`Payroll Period: ${payroll.period}`, 335, 74, {
      width: 220,
      align: 'right',
    });

  doc.restore();
}

function drawFooter(doc, pageNo = 1) {
  doc.save();
  doc
    .strokeColor(LIGHT_BORDER)
    .lineWidth(1)
    .moveTo(36, 785)
    .lineTo(559, 785)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      'This is a computer-generated, password-protected payslip. It is confidential and intended only for the named employee.',
      36,
      794,
      {
        width: 430,
      }
    )
    .text(`Page ${pageNo}`, 500, 794, {
      width: 59,
      align: 'right',
    });
  doc.restore();
}

function drawSectionTitle(doc, title, x, y, width = 523) {
  doc.save();
  doc
    .roundedRect(x, y, width, 26, 6)
    .fill(BRAND_BLUE);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#ffffff')
    .text(title, x + 12, y + 8, {
      width: width - 24,
    });
  doc.restore();
}

function drawInfoBox(doc, items, x, y, width, columns = 2) {
  const colWidth = width / columns;
  const rowHeight = 44;
  const rows = Math.ceil(items.length / columns);
  const height = rows * rowHeight + 14;

  doc.save();
  doc.roundedRect(x, y, width, height, 8).fill(LIGHT_BG).strokeColor(LIGHT_BORDER).stroke();

  items.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const itemX = x + 14 + col * colWidth;
    const itemY = y + 12 + row * rowHeight;

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(item.label, itemX, itemY, {
        width: colWidth - 22,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(DARK)
      .text(item.value || '-', itemX, itemY + 13, {
        width: colWidth - 22,
      });
  });

  doc.restore();
  return y + height;
}

function drawAmountTable(doc, title, rows, x, y, width = 250) {
  drawSectionTitle(doc, title, x, y, width);

  let currentY = y + 36;

  doc.save();
  doc.roundedRect(x, currentY - 6, width, rows.length * 24 + 12, 8).fill('#ffffff').strokeColor(LIGHT_BORDER).stroke();

  rows.forEach((row, index) => {
    const rowY = currentY + index * 24;

    if (index > 0) {
      doc
        .strokeColor('#f1f5f9')
        .lineWidth(1)
        .moveTo(x + 10, rowY - 6)
        .lineTo(x + width - 10, rowY - 6)
        .stroke();
    }

    doc
      .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(row.bold ? 10 : 9.5)
      .fillColor(row.color || DARK)
      .text(row.label, x + 12, rowY, {
        width: width - 120,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(row.bold ? 10 : 9.5)
      .fillColor(row.color || DARK)
      .text(money(row.value), x + width - 112, rowY, {
        width: 100,
        align: 'right',
      });
  });

  doc.restore();
  return currentY + rows.length * 24 + 12;
}

function drawNetPayBox(doc, payroll, x, y, width = 523) {
  doc.save();
  doc.roundedRect(x, y, width, 58, 10).fill('#eff6ff').strokeColor('#bfdbfe').stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(DARK)
    .text('NET PAY', x + 18, y + 18);
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor(BRAND_BLUE)
    .text(money(payroll.net_pay), x + width - 230, y + 14, {
      width: 210,
      align: 'right',
    });
  doc.restore();
}

function totalEmployeeDeductions(payroll) {
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

async function buildPayslipPdf({ payroll, employee, password }) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      userPassword: password,
      ownerPassword:
        process.env.PDF_OWNER_PASSWORD || `${password}-owner-${payroll.id}`,
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
      info: {
        Title: `Payslip ${employee.name} ${payroll.period}`,
        Author: 'WtecHR',
        Subject: 'Confidential Payslip',
      },
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawPageHeader(doc, payroll);

    let y = 136;

    y = drawInfoBox(
      doc,
      [
        { label: 'Employee Name', value: employee.name },
        { label: 'Employee ID', value: String(employee.id) },
        { label: 'Department', value: employee.department || '-' },
        { label: 'Designation', value: employee.title || '-' },
        { label: 'Payroll Period', value: payroll.period },
        { label: 'Payroll Status', value: payroll.status },
        { label: 'EPF No', value: employee.epf_no || '-' },
        { label: 'SOCSO No', value: employee.socso_no || '-' },
        { label: 'Income Tax No', value: employee.income_tax_no || '-' },
        {
          label: 'Bank',
          value:
            employee.bank_name || employee.bank_account_no
              ? `${employee.bank_name || '-'} · ${employee.bank_account_no || '-'}`
              : '-',
        },
      ],
      36,
      y,
      523,
      2
    );

    y += 22;

    const earningsRows = [
      { label: 'Base Salary', value: payroll.base_salary },
      { label: 'Bonus', value: payroll.bonus },
      { label: 'Overtime Pay', value: payroll.ot_pay },
      { label: 'Claims', value: payroll.claim_amount },
      { label: 'Gross Pay', value: payroll.gross_pay, bold: true, color: '#059669' },
    ];

    const deductionsRows = [
      { label: 'EPF Employee', value: payroll.epf_employee },
      { label: 'SOCSO Employee', value: payroll.socso_employee },
      { label: 'EIS Employee', value: payroll.eis_employee },
      { label: 'PCB / Tax', value: payroll.pcb },
      { label: 'Leave Deduction', value: payroll.leave_deduction },
      { label: 'Lunch Deduction', value: payroll.lunch_deduction },
      { label: 'Other Deductions', value: payroll.deductions },
      {
        label: 'Total Deductions',
        value: totalEmployeeDeductions(payroll),
        bold: true,
        color: BRAND_RED,
      },
    ];

    const leftEnd = drawAmountTable(doc, 'EARNINGS', earningsRows, 36, y, 252);
    const rightEnd = drawAmountTable(doc, 'DEDUCTIONS', deductionsRows, 307, y, 252);

    y = Math.max(leftEnd, rightEnd) + 24;

    drawNetPayBox(doc, payroll, 36, y);

    y += 82;

    drawSectionTitle(doc, 'EMPLOYER CONTRIBUTIONS', 36, y, 523);
    y += 40;

    y = drawInfoBox(
      doc,
      [
        { label: 'EPF Employer', value: money(payroll.epf_employer) },
        { label: 'SOCSO Employer', value: money(payroll.socso_employer) },
        { label: 'EIS Employer', value: money(payroll.eis_employer) },
        {
          label: 'Total Employer Contribution',
          value: money(
            numberValue(payroll.epf_employer) +
              numberValue(payroll.socso_employer) +
              numberValue(payroll.eis_employer)
          ),
        },
      ],
      36,
      y,
      523,
      2
    );

    drawFooter(doc, 1);

    doc.addPage();
    drawPageHeader(doc, payroll);

    y = 140;

    drawSectionTitle(doc, 'PAYROLL DETAILS', 36, y, 523);
    y += 40;

    y = drawInfoBox(
      doc,
      [
        { label: 'OT Hours', value: String(payroll.ot_hours || 0) },
        { label: 'OT Rate', value: money(payroll.ot_rate) },
        { label: 'Unpaid Leave Days', value: String(payroll.unpaid_leave_days || 0) },
        { label: 'Lunch Late Minutes', value: String(payroll.lunch_late_minutes || 0) },
        { label: 'Approved By', value: payroll.approved_by || '-' },
        { label: 'Approved At', value: formatDate(payroll.approved_at) },
        { label: 'Released At', value: formatDate(payroll.released_at) },
        { label: 'Payslip Generated', value: formatDate(new Date().toISOString()) },
      ],
      36,
      y,
      523,
      2
    );

    y += 26;

    drawSectionTitle(doc, 'REMARKS', 36, y, 523);
    y += 42;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#333333')
      .text(payroll.remarks || '-', 56, y, {
        width: 483,
        lineGap: 4,
      });

    y += 130;

    drawSectionTitle(doc, 'CONFIDENTIALITY NOTICE', 36, y, 523);
    y += 42;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#333333')
      .text(
        'This payslip is issued by WtecHR and contains confidential payroll information. The PDF is encrypted using the employee date of birth and identity last 4 digits. Please keep this document secure and do not share it publicly.',
        56,
        y,
        {
          width: 483,
          lineGap: 4,
        }
      );

    drawFooter(doc, 2);
    doc.end();
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({
        error: 'Method not allowed',
      });
    }

    const payrollId = Number(req.query.id);

    if (!payrollId) {
      return res.status(400).json({
        error: 'Payslip payroll id is required.',
      });
    }

    const { data: payroll, error: payrollError } = await supabase
      .from('payroll')
      .select('*')
      .eq('id', payrollId)
      .maybeSingle();

    if (payrollError) throw payrollError;

    if (!payroll) {
      return res.status(404).json({
        error: 'Payroll record not found.',
      });
    }

    if (!['released', 'paid'].includes(String(payroll.status).toLowerCase())) {
      return res.status(403).json({
        error: 'Payslip is not released yet.',
      });
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select(
        'id, name, email, department, title, date_of_birth, identity_type, identity_last4, bank_name, bank_account_no, epf_no, socso_no, income_tax_no'
      )
      .eq('id', payroll.employee_id)
      .maybeSingle();

    if (employeeError) throw employeeError;

    if (!employee) {
      return res.status(404).json({
        error: 'Employee not found.',
      });
    }

    const password = makePassword(
      employee.date_of_birth,
      employee.identity_last4
    );

    if (!password) {
      return res.status(400).json({
        error:
          'Employee date of birth and identity last 4 digits are required before generating encrypted payslip.',
      });
    }

    const buffer = await buildPayslipPdf({
      payroll,
      employee,
      password,
    });

    const safeName = String(employee.name || `employee-${employee.id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payslip-${safeName}-${payroll.period}.pdf"`
    );
    res.setHeader('Content-Length', buffer.length);

    return res.status(200).send(buffer);
  } catch (err) {
    console.error('Payslip API error:', err);

    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error.',
    });
  }
}