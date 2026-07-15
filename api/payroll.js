import supabase from './db-client.js';

const PAYROLL_STATUSES = ['draft', 'reviewed', 'approved', 'released', 'paid'];

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanString(value) {
  return String(value ?? '').trim();
}

function calculatePayrollTotals(row) {
  const baseSalary = toNumber(row.base_salary);
  const bonus = toNumber(row.bonus);
  const otPay = toNumber(row.ot_pay);
  const claimAmount = toNumber(row.claim_amount);

  const leaveDeduction = toNumber(row.leave_deduction);
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
    deductions + leaveDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb;

  const netPay =
    row.net_pay !== undefined && row.net_pay !== null && row.net_pay !== ''
      ? toNumber(row.net_pay)
      : grossPay - totalDeductions;

  return {
    gross_pay: Math.round(grossPay * 100) / 100,
    net_pay: Math.round(netPay * 100) / 100,
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
      acc.total_deductions +=
        toNumber(row.deductions) +
        toNumber(row.leave_deduction) +
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // =========================
    // GET PAYROLL / BATCHES
    // =========================
    if (req.method === 'GET') {
      const { employee_id, period, batches } = req.query;

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

    // =========================
    // POST: CREATE BATCH / IMPORT / CREATE RECORD
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      if (action === 'create_batch') {
        const batch = await getOrCreateBatch(body.period);
        const summary = await recomputeBatch(body.period);

        return res.status(201).json(summary || batch);
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
              `Row ${i + 1}: ${err instanceof Error ? err.message : 'Import failed'}`
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

    // =========================
    // PUT: UPDATE RECORD / APPROVE BATCH / RELEASE BATCH
    // =========================
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

    // =========================
    // DELETE RECORD
    // =========================
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