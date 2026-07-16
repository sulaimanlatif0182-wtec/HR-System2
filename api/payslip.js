import PDFDocument from 'pdfkit';
import supabase from './db-client.js';

function money(value) {
  return `RM ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function drawRow(doc, label, value, x, y, width = 240) {
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555')
    .text(label, x, y, { width });

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#111')
    .text(value || '-', x, y + 13, { width });
}

function drawLine(doc, y) {
  doc
    .strokeColor('#dddddd')
    .lineWidth(1)
    .moveTo(36, y)
    .lineTo(559, y)
    .stroke();
}

function drawAmountRow(doc, label, value, y, options = {}) {
  const color = options.color || '#111';

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#111')
    .text(label, 56, y);

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(color)
    .text(money(value), 430, y, {
      width: 100,
      align: 'right',
    });
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
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.rect(36, 36, 523, 70).fill('#111827');

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text('WtecHR Payslip', 56, 55);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#d1d5db')
      .text('Confidential salary document', 56, 82);

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text(payroll.period, 460, 60, {
        width: 75,
        align: 'right',
      });

    // Employee information
    doc
      .fillColor('#111')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('Employee Information', 36, 130);

    drawLine(doc, 152);

    drawRow(doc, 'Employee Name', employee.name, 56, 170);
    drawRow(doc, 'Employee ID', String(employee.id), 320, 170);
    drawRow(doc, 'Department', employee.department || '-', 56, 215);
    drawRow(doc, 'Designation', employee.title || '-', 320, 215);
    drawRow(doc, 'Period', payroll.period, 56, 260);
    drawRow(doc, 'Status', payroll.status, 320, 260);

    // Earnings
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111')
      .text('Earnings', 36, 320);

    drawLine(doc, 342);

    drawAmountRow(doc, 'Base Salary', payroll.base_salary, 360);
    drawAmountRow(doc, 'Bonus', payroll.bonus, 382);
    drawAmountRow(doc, 'OT Pay', payroll.ot_pay, 404);
    drawAmountRow(doc, 'Claims', payroll.claim_amount, 426);

    drawLine(doc, 452);

    drawAmountRow(doc, 'Gross Pay', payroll.gross_pay, 466, {
      color: '#059669',
    });

    // Deductions
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111')
      .text('Deductions', 36, 520);

    drawLine(doc, 542);

    drawAmountRow(doc, 'EPF Employee', payroll.epf_employee, 560);
    drawAmountRow(doc, 'SOCSO Employee', payroll.socso_employee, 582);
    drawAmountRow(doc, 'EIS Employee', payroll.eis_employee, 604);
    drawAmountRow(doc, 'PCB', payroll.pcb, 626);
    drawAmountRow(doc, 'Leave Deduction', payroll.leave_deduction, 648);
    drawAmountRow(doc, 'Other Deductions', payroll.deductions, 670);

    drawLine(doc, 698);

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#111')
      .text('Net Pay', 56, 716);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#2563eb')
      .text(money(payroll.net_pay), 390, 712, {
        width: 140,
        align: 'right',
      });

    // Second page
    doc.addPage();

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#111')
      .text('Employer Contributions & Details', 36, 50);

    drawLine(doc, 75);

    drawAmountRow(doc, 'EPF Employer', payroll.epf_employer, 100);
    drawAmountRow(doc, 'SOCSO Employer', payroll.socso_employer, 122);
    drawAmountRow(doc, 'EIS Employer', payroll.eis_employer, 144);

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111')
      .text('Payroll Details', 36, 200);

    drawLine(doc, 222);

    drawRow(doc, 'OT Hours', String(payroll.ot_hours || 0), 56, 240);
    drawRow(doc, 'OT Rate', money(payroll.ot_rate), 320, 240);
    drawRow(
      doc,
      'Unpaid Leave Days',
      String(payroll.unpaid_leave_days || 0),
      56,
      285
    );
    drawRow(doc, 'Released At', formatDate(payroll.released_at), 320, 285);
    drawRow(doc, 'Approved By', payroll.approved_by || '-', 56, 330);
    drawRow(doc, 'Approved At', formatDate(payroll.approved_at), 320, 330);

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111')
      .text('Remarks', 36, 400);

    drawLine(doc, 422);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#333')
      .text(payroll.remarks || '-', 56, 440, {
        width: 460,
        lineGap: 3,
      });

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#777')
      .text(
        'This is a computer-generated payslip. The PDF is password-protected using employee identity verification.',
        36,
        780,
        {
          width: 523,
          align: 'center',
        }
      );

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
        'id, name, email, department, title, date_of_birth, identity_type, identity_last4'
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