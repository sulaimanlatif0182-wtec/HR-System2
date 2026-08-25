import employeesRouter from './employees/router.js';
import registerHandler from './register.js';
import leaveHandler from './leave.js';
import claimsHandler from './claims.js';
import payrollHandler from './payroll.js';
import departmentsHandler from './departments.js';
import deviceAuthHandler from './device-auth.js';
import attendanceHandler from './attendance.js';
import authWorkerLoginHandler from './auth/worker-login.js';
import payslipHandler from './payslip.js';

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