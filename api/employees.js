import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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
        const cleanEmail = String(email).trim();

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
      const {
        name,
        email,
        title,
        department,
        phone,
        location,
        role,
        status,
        join_date,
        salary,
      } = req.body || {};

      if (!name || !email) {
        return res.status(400).json({
          error: 'Name and email are required.',
        });
      }

      const payload = {
        name,
        email: String(email).trim().toLowerCase(),
        title: title || null,
        department: department || null,
        phone: phone || null,
        location: location || null,
        role: role || 'employee',
        status: status || 'active',
        join_date: join_date || new Date().toISOString().slice(0, 10),
        salary: salary ?? null,
      };

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
