import { supabase } from '../db-client.js';
import { isFeatureEnabled } from '../feature-flags.js';
import { requireAuth } from '../requireAuth.js';
import { setCors } from '../cors.js';
import {
  notifyClaimSubmitted,
  notifyClaimPendingAdmin,
  notifyClaimPendingFinance,
  notifyClaimDecision,
} from '../../server/notify.js';
import { parseClaim } from '../validators.js';
import { dbError } from '../errors.js';
import {
  cleanString,
  toNumber,
  isFinanceManager,
  isAdmin,
  isManager,
  sameDepartment,
  buildClaimPayload,
} from '../claimMath.js';

async function getEmployee(employeeId) {
  if (!employeeId) return null;

  const { data, error } = await supabase
    .from('employees')
    .select('id, name, email, role, department, title, status')
    .eq('id', Number(employeeId))
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

async function safeNotify(fn, payload) {
  try {
    await fn(payload);
  } catch (err) {
    console.error('Notification error:', err instanceof Error ? err.message : err);
  }
}

export default async function handler(req, res) {
  setCors(res, req);
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    // =========================
    // GET CLAIMS
    // =========================
    if (req.method === 'GET') {
      const { employee_id, status, payroll_period } = req.query;

      let query = supabase
        .from('claims')
        .select('*')
        .order('created_at', { ascending: false });

      // Workers only ever see their own claims.
      if (authUser.category === 'worker') query = query.eq('employee_id', authUser.id);
      if (employee_id && authUser.category !== 'worker') query = query.eq('employee_id', employee_id);
      if (status) query = query.eq('status', status);
      if (payroll_period) query = query.eq('payroll_period', payroll_period);

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json(data || []);
    }

    // =========================
    // CREATE CLAIM
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};

      const parsed = parseClaim(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error });
      }

      if (!(await isFeatureEnabled('claims_request'))) {
        return res.status(403).json({
          error: 'Claim submission is currently disabled.',
        });
      }

      if (!body.employee_id) {
        return res.status(400).json({
          error: 'Employee is required.',
        });
      }

      if (!body.claim_date) {
        return res.status(400).json({
          error: 'Claim date is required.',
        });
      }

      if (!body.description || !cleanString(body.description)) {
        return res.status(400).json({
          error: 'Purpose / description is required.',
        });
      }

      if (!body.amount || toNumber(body.amount) <= 0) {
        return res.status(400).json({
          error: 'Amount must be greater than 0.',
        });
      }

      const employee = await getEmployee(Number(body.employee_id));

      if (!employee) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      if (String(employee.status || '').toLowerCase() === 'inactive') {
        return res.status(403).json({
          error: 'Inactive employee cannot submit claims.',
        });
      }

      const payload = buildClaimPayload(body);

      const { data, error } = await supabase
        .from('claims')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      await safeNotify(notifyClaimSubmitted, data);

      return res.status(201).json(data);
    }

    // =========================
    // UPDATE CLAIM STATUS
    // =========================
    if (req.method === 'PUT') {
      const {
        id,
        action,
        actor_id,
        actor_name,
        actor_role,
        actor_department,
        rejection_reason,
        payroll_period,
      } = req.body || {};

      if (!id) {
        return res.status(400).json({
          error: 'id is required.',
        });
      }

      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (claimError) throw claimError;

      if (!claim) {
        return res.status(404).json({
          error: 'Claim not found.',
        });
      }

      const employee = await getEmployee(claim.employee_id);

      if (!employee) {
        return res.status(404).json({
          error: 'Claim employee not found.',
        });
      }

      const role = authUser?.role || 'employee';
      const admin = isAdmin(role);
      const manager = isManager(role);
      const financeManager = isFinanceManager(role, actor_department);

      if (action !== 'cancel' && !(await isFeatureEnabled('claims_approval'))) {
        return res.status(403).json({
          error: 'Claim approvals are currently disabled.',
        });
      }

      if (action === 'cancel') {
        if (!actor_id) {
          return res.status(400).json({
            error: 'actor_id is required.',
          });
        }

        if (!admin && Number(actor_id) !== Number(claim.employee_id)) {
          return res.status(403).json({
            error: 'Only owner or admin can cancel this claim.',
          });
        }

        if (claim.status !== 'pending_manager') {
          return res.status(400).json({
            error: 'Only pending manager claims can be cancelled.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'cancelled',
            rejected_by: actor_name || 'Employee',
            rejected_at: new Date().toISOString(),
            rejection_reason: 'Cancelled by employee',
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      if (action === 'manager_approve') {
        if (claim.status !== 'pending_manager') {
          return res.status(400).json({
            error: 'Claim is not pending manager approval.',
          });
        }

        if (!admin) {
          if (!manager) {
            return res.status(403).json({
              error: 'Only manager or admin can approve this stage.',
            });
          }

          if (Number(actor_id) === Number(claim.employee_id)) {
            return res.status(403).json({
              error: 'Manager cannot approve own claim.',
            });
          }

          if (!sameDepartment(employee.department, actor_department)) {
            return res.status(403).json({
              error: 'Manager can only approve claims from own department.',
            });
          }
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'pending_admin',
            manager_approved_by: actor_name || 'Manager',
            manager_approved_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        await safeNotify(notifyClaimPendingAdmin, data);

        return res.status(200).json(data);
      }

      if (action === 'admin_approve') {
        if (claim.status !== 'pending_admin') {
          return res.status(400).json({
            error: 'Claim is not pending admin approval.',
          });
        }

        if (!admin) {
          return res.status(403).json({
            error: 'Only admin can approve this stage.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'pending_finance',
            admin_approved_by: actor_name || 'Admin',
            admin_approved_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        await safeNotify(notifyClaimPendingFinance, data);

        return res.status(200).json(data);
      }

      if (action === 'finance_approve') {
        if (claim.status !== 'pending_finance') {
          return res.status(400).json({
            error: 'Claim is not pending finance approval.',
          });
        }

        if (!admin && !financeManager) {
          return res.status(403).json({
            error: 'Only Finance Manager or Admin can approve finance stage.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'approved',
            finance_approved_by: actor_name || 'Finance',
            finance_approved_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        await safeNotify(notifyClaimDecision, data);

        return res.status(200).json(data);
      }

      if (action === 'reject') {
        if (manager && !admin && !financeManager) {
          if (claim.status !== 'pending_manager') {
            return res.status(400).json({
              error: 'Claim has already passed the manager stage.',
            });
          }

          if (!sameDepartment(employee.department, actor_department)) {
            return res.status(403).json({
              error: 'Manager can only reject claims from own department.',
            });
          }
        }

        if (financeManager && !admin && !manager) {
          if (claim.status !== 'pending_finance') {
            return res.status(400).json({
              error: 'Claim is not pending finance approval.',
            });
          }
        }

        if (!admin && !manager && !financeManager) {
          return res.status(403).json({
            error: 'Only manager, finance manager or admin can reject claims.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            status: 'rejected',
            rejected_by: actor_name || 'Approver',
            rejected_at: new Date().toISOString(),
            rejection_reason: rejection_reason || 'Rejected',
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        await safeNotify(notifyClaimDecision, data);

        return res.status(200).json(data);
      }

      if (action === 'mark_included') {
        if (!admin) {
          return res.status(403).json({
            error: 'Only admin can mark claim as included in payroll.',
          });
        }

        const { data, error } = await supabase
          .from('claims')
          .update({
            payroll_period: payroll_period || claim.payroll_period,
            included_in_payroll: true,
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      }

      return res.status(400).json({
        error: 'Invalid action.',
      });
    }

    // =========================
    // DELETE CLAIM
    // =========================
    if (req.method === 'DELETE') {
      const { id } = req.body || {};

      if (!id) {
        return res.status(400).json({
          error: 'id is required.',
        });
      }

      const { error } = await supabase.from('claims').delete().eq('id', id);

      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Claims API error:', err);
    dbError(res, err, 'Internal server error.');
  }
}