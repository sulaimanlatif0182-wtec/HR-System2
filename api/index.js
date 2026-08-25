import employeesRouter from '../lib/api/employees/router.js';
import registerHandler from '../lib/api/register.js';
import leaveHandler from '../lib/api/leave.js';
import claimsHandler from '../lib/api/claims.js';
import payrollHandler from '../lib/api/payroll.js';
import departmentsHandler from '../lib/api/departments.js';
import deviceAuthHandler from '../lib/api/device-auth.js';
import attendanceHandler from '../lib/api/attendance.js';
import authWorkerLoginHandler from '../lib/api/worker-login.js';
import payslipHandler from '../lib/api/payslip.js';
import { supabase } from '../lib/db-client.js';
import { dbError } from '../lib/errors.js';
import { normalizeEmail, publicEmployee } from '../lib/employeeLogic.js';
import { getFeatureFlags } from '../lib/feature-flags.js';

export default async function handler(req, res) {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // ========== PUBLIC ENDPOINTS (no auth required) ==========
    // Handle these BEFORE routing to sub-handlers that require auth

    if (url.startsWith('/api/employees')) {
      const queryStart = url.indexOf('?');
      const queryString = queryStart !== -1 ? url.substring(queryStart) : '';
      const params = new URLSearchParams(queryString);

      // Public: profile lookup by email
      if (params.has('email')) {
        const cleanEmail = normalizeEmail(params.get('email'));
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();
        if (error) return dbError(res, error);
        return res.status(200).json(publicEmployee(data));
      }

      // Public: feature flags
      if (params.get('feature_flags') === 'true') {
        const flags = await getFeatureFlags();
        return res.status(200).json(flags);
      }

      // Public: feature access checks (my_feature_access, feature_access)
      if (params.get('my_feature_access') === 'true' || params.get('feature_access') === 'true') {
        // Let these through to the router which will handle them
        // but we need to NOT require auth in the feature-flags handler for these
      }
    }

    // ========== ROUTE TO SUB-HANDLERS ==========
    // Route to appropriate handler based on path
    if (url.startsWith('/api/employees')) {
      // Rewrite URL for router
      req.url = url.replace('/api/employees', '') || '/';
      return employeesRouter(req, res);
    }

    if (url.startsWith('/api/register')) {
      req.url = url.replace('/api/register', '') || '/';
      return registerHandler(req, res);
    }

    if (url.startsWith('/api/leave')) {
      req.url = url.replace('/api/leave', '') || '/';
      return leaveHandler(req, res);
    }

    if (url.startsWith('/api/claims')) {
      req.url = url.replace('/api/claims', '') || '/';
      return claimsHandler(req, res);
    }

    if (url.startsWith('/api/payroll')) {
      req.url = url.replace('/api/payroll', '') || '/';
      return payrollHandler(req, res);
    }

    if (url.startsWith('/api/departments')) {
      req.url = url.replace('/api/departments', '') || '/';
      return departmentsHandler(req, res);
    }

    if (url.startsWith('/api/device-auth')) {
      req.url = url.replace('/api/device-auth', '') || '/';
      return deviceAuthHandler(req, res);
    }

    if (url.startsWith('/api/attendance')) {
      req.url = url.replace('/api/attendance', '') || '/';
      return attendanceHandler(req, res);
    }

    if (url.startsWith('/api/auth/worker-login')) {
      req.url = url.replace('/api/auth/worker-login', '') || '/';
      return authWorkerLoginHandler(req, res);
    }

    if (url.startsWith('/api/payslip')) {
      req.url = url.replace('/api/payslip', '') || '/';
      return payslipHandler(req, res);
    }

    // Health check
    if (url === '/api/health' || url === '/api/') {
      return res.status(200).json({ ok: true, service: 'hr-system-api' });
    }

    return res.status(404).json({ error: 'API endpoint not found' });
  } catch (err) {
    console.error('API router error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}