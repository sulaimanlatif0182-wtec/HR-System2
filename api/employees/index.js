import { supabase } from '../../lib/db-client.js';
import { requireAuth } from '../../lib/requireAuth.js';
import { assertAdmin } from '../../lib/authorize.js';
import { setCors } from '../../lib/cors.js';
import { dbError } from '../../lib/errors.js';
import { recordExists } from './helpers.js';
import {
  cleanString,
  normalizeEmail,
  buildEmployeePayload,
  friendlyDatabaseError,
  publicEmployee,
} from '../../lib/employeeLogic.js';

async function safeInsertSystemAudit(payload) {
  try {
    await supabase.from('system_audit_logs').insert({
      module: payload.module || 'general',
      action: payload.action || 'unknown',
      record_id: payload.record_id || null,
      employee_id: payload.employee_id || null,
      changed_by: payload.changed_by || null,
      changed_by_name: payload.changed_by_name || null,
      old_data: payload.old_data || null,
      new_data: payload.new_data || null,
      reason: payload.reason || null,
    });
  } catch (err) {
    console.error('System audit insert failed:', err?.message || err);
  }
}

export default async function handler(req, res) {
  setCors(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    if (req.method === 'GET') {
      const { email, id, limit, offset } = req.query;

      if (email) {
        const cleanEmail = normalizeEmail(email);
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (error) return dbError(res, error);
        return res.status(200).json(publicEmployee(data));
      }

      if (id) {
        const employeeId = Number(id);
        if (!employeeId) {
          return res.status(400).json({ error: 'Valid employee ID is required.' });
        }

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('id', employeeId)
          .maybeSingle();

        if (error) return dbError(res, error);
        return res.status(200).json(publicEmployee(data));
      }

      const listLimit = Number(limit) || 0;
      const listOffset = Number(offset) || 0;

      let listQuery = supabase
        .from('employees')
        .select('*')
        .order('id', { ascending: true });

      if (authUser.category === 'worker') {
        listQuery = listQuery.eq('id', authUser.id);
      }

      if (listLimit > 0) {
        listQuery = listQuery.range(listOffset, listOffset + listLimit - 1);
      }

      const { data, error } = await listQuery;
      if (error) return dbError(res, error);

      return res.status(200).json((data || []).map(publicEmployee));
    }

    if (req.method === 'POST') {
      if (!assertAdmin(authUser, res)) return;

      const body = req.body || {};

      if (!body.name || (!body.email && body.category !== 'worker')) {
        return res.status(400).json({ error: 'Name and email are required.' });
      }

      const payload = buildEmployeePayload(body, { partial: false });

      if (payload.email && (await recordExists('employees', [['email', payload.email, 'ilike']]))) {
        return res.status(409).json({ error: 'An employee with this email already exists.' });
      }

      if (payload.employee_no && (await recordExists('employees', [['employee_no', payload.employee_no]]))) {
        return res.status(409).json({ error: 'This employee ID is already in use.' });
      }

      const { data, error } = await supabase
        .from('employees')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: friendlyDatabaseError(error, 'Failed to add employee.'),
        });
      }

      await safeInsertSystemAudit({
        module: 'employees',
        action: 'employee_create',
        record_id: data?.id || null,
        employee_id: data?.id || null,
        changed_by: authUser?.id || null,
        changed_by_name: authUser?.name || null,
        new_data: data,
      });

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!assertAdmin(authUser, res)) return;

      const body = req.body || {};
      const id = Number(body.id || req.query.id);

      if (!id) {
        return res.status(400).json({ error: 'Employee ID is required.' });
      }

      const { data: existing, error: findError } = await supabase
        .from('employees')
        .select('id, email, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) return res.status(500).json({ error: findError.message });
      if (!existing) return res.status(404).json({ error: 'Employee not found.' });

      const payload = buildEmployeePayload(body, { partial: true });

      if (payload.email && (await recordExists('employees', [['email', payload.email, 'ilike']], id))) {
        return res.status(409).json({ error: 'Another employee already uses this email address.' });
      }

      if (payload.employee_no && (await recordExists('employees', [['employee_no', payload.employee_no]], id))) {
        return res.status(409).json({ error: 'Another employee already uses this employee ID.' });
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'No fields to update.' });
      }

      const { data, error } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: friendlyDatabaseError(error, 'Failed to update employee.'),
        });
      }

      await safeInsertSystemAudit({
        module: 'employees',
        action: 'employee_update',
        record_id: id,
        employee_id: id,
        changed_by: authUser?.id || null,
        changed_by_name: authUser?.name || null,
        old_data: existing,
        new_data: data,
      });

      return res.status(200).json({ success: true, employee: data });
    }

    if (req.method === 'DELETE') {
      if (!assertAdmin(authUser, res)) return;

      const id = Number(req.query.id);

      if (!id) {
        return res.status(400).json({ error: 'Employee ID is required.' });
      }

      const { data: employee, error: findError } = await supabase
        .from('employees')
        .select('id, name, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) return res.status(500).json({ error: findError.message });
      if (!employee) return res.status(404).json({ error: 'Employee not found.' });

      if (String(employee.role || '').toLowerCase() === 'admin') {
        return res.status(403).json({ error: 'Admin profile cannot be deactivated.' });
      }

      if (employee.status === 'inactive') {
        return res.status(200).json({ success: true, message: 'Employee is already inactive.', employee });
      }

      const { data, error: updateError } = await supabase
        .from('employees')
        .update({ status: 'inactive' })
        .eq('id', id)
        .select()
        .single();

      if (updateError) return res.status(500).json({ error: updateError.message });

      await safeInsertSystemAudit({
        module: 'employees',
        action: 'employee_deactivate',
        record_id: id,
        employee_id: id,
        changed_by: authUser?.id || null,
        changed_by_name: authUser?.name || null,
        old_data: employee,
        new_data: data,
      });

      return res.status(200).json({ success: true, message: 'Employee deactivated successfully.', employee: data });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Employees API error:', err);
    return dbError(res, err);
  }
}