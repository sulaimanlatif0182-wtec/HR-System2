import supabase from './db-client.js';

function cleanString(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function normalizeIdentityLast4(value, type) {
  const raw = cleanString(value);

  if (type === 'IC') {
    return raw.replace(/\D/g, '').slice(0, 4);
  }

  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function buildEmployeePayload(body, { partial = false } = {}) {
  const payload = {};

  const assign = (key, value) => {
    if (partial) {
      if (value !== undefined) payload[key] = value;
    } else {
      payload[key] = value;
    }
  };

  assign('name', body.name ? cleanString(body.name) : partial ? undefined : '');
  assign('email', body.email ? normalizeEmail(body.email) : partial ? undefined : '');
  assign('title', body.title ? cleanString(body.title) : partial ? undefined : null);
  assign(
    'department',
    body.department ? cleanString(body.department) : partial ? undefined : null
  );
  assign('phone', body.phone ? cleanString(body.phone) : partial ? undefined : null);
  assign(
    'location',
    body.location ? cleanString(body.location) : partial ? undefined : null
  );
  assign('role', body.role ? cleanString(body.role) : partial ? undefined : 'employee');
  assign(
    'status',
    body.status ? cleanString(body.status) : partial ? undefined : 'active'
  );
  assign(
    'join_date',
    body.join_date
      ? cleanString(body.join_date)
      : partial
        ? undefined
        : new Date().toISOString().slice(0, 10)
  );

  if (body.salary !== undefined || !partial) {
    assign('salary', toNullableNumber(body.salary));
  }

  assign(
    'date_of_birth',
    body.date_of_birth
      ? cleanString(body.date_of_birth)
      : partial
        ? undefined
        : null
  );

  assign(
    'identity_type',
    body.identity_type ? cleanString(body.identity_type) : partial ? undefined : null
  );

  if (body.identity_last4 !== undefined || !partial) {
    const identityType = body.identity_type ? cleanString(body.identity_type) : 'IC';

    assign(
      'identity_last4',
      body.identity_last4
        ? normalizeIdentityLast4(body.identity_last4, identityType)
        : partial
          ? undefined
          : null
    );
  }

  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // =========================
    // GET EMPLOYEE / EMPLOYEES
    // Supports:
    // /api/employees
    // /api/employees?email=test@email.com
    // /api/employees?id=1
    // =========================
    if (req.method === 'GET') {
      const { email, id } = req.query;

      if (email) {
        const cleanEmail = normalizeEmail(email);

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(data || null);
      }

      if (id) {
        const employeeId = Number(id);

        if (!employeeId) {
          return res.status(400).json({
            error: 'Valid employee ID is required.',
          });
        }

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('id', employeeId)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(data || null);
      }

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json(data || []);
    }

    // =========================
    // ADD EMPLOYEE
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};

      if (!body.name || !body.email) {
        return res.status(400).json({
          error: 'Name and email are required.',
        });
      }

      const payload = buildEmployeePayload(body, { partial: false });

      const { data, error } = await supabase
        .from('employees')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(201).json(data);
    }

    // =========================
    // EDIT EMPLOYEE
    // Admin-only in UI; API updates provided fields
    // =========================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = Number(body.id || req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'Employee ID is required.',
        });
      }

      const { data: existing, error: findError } = await supabase
        .from('employees')
        .select('id, email, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) {
        return res.status(500).json({
          error: findError.message,
        });
      }

      if (!existing) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      const payload = buildEmployeePayload(body, { partial: true });

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({
          error: 'No fields to update.',
        });
      }

      const { data, error } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json({
        success: true,
        employee: data,
      });
    }

    // =========================
    // SOFT DELETE / DEACTIVATE EMPLOYEE
    // Does NOT remove employee from database.
    // Only changes status to inactive.
    // =========================
    if (req.method === 'DELETE') {
      const id = Number(req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'Employee ID is required.',
        });
      }

      const { data: employee, error: findError } = await supabase
        .from('employees')
        .select('id, name, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) {
        return res.status(500).json({
          error: findError.message,
        });
      }

      if (!employee) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      const role = String(employee.role || '').toLowerCase();

      if (role === 'admin') {
        return res.status(403).json({
          error: 'Admin profile cannot be deactivated from this action.',
        });
      }

      if (employee.status === 'inactive') {
        return res.status(200).json({
          success: true,
          message: 'Employee is already inactive.',
          employee,
        });
      }

      const { data, error: updateError } = await supabase
        .from('employees')
        .update({
          status: 'inactive',
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          error: updateError.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Employee deactivated successfully.',
        employee: data,
      });
    }

    return res.status(405).json({
      error: `Method ${req.method} not allowed.`,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error.',
    });
  }
}