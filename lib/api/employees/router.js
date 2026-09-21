import employeesHandler from './index.js';
import featureFlagsHandler from './feature-flags.js';
import adminConfigHandler from './admin-config.js';
import remindersHandler from './reminders.js';
import announcementsHandler from './announcements.js';
import hrLettersHandler from './hr-letters.js';
import performanceHandler from './performance.js';
import documentsHandler from './documents.js';
import importsHandler from './imports.js';
import workerAuthHandler from './worker-auth.js';
import systemHandler from './system.js';

export default async function handler(req, res) {
  const path = req.url || '';

  // All app pages POST their `action` to bare `/api/employees`, so route
  // write actions by body.action too (imports/worker-login below already do).
  // Without this, feature saves fall through to employeesHandler and 400
  // with "Name and email are required." Nothing is deleted by this change.
  const bodyAction = typeof req.body?.action === 'string' ? req.body.action : '';
  const writes = req.method === 'POST' || req.method === 'PUT';
  const isAction = (...actions) => writes && actions.includes(bodyAction);

  if (path.includes('/feature-flags') || path.includes('feature_flags') || path.includes('feature_access')) {
    return featureFlagsHandler(req, res);
  }

  if (isAction('feature_flag_update', 'feature_flags_bulk_update', 'feature_access_bulk_update', 'role_defaults_bulk_update')) {
    return featureFlagsHandler(req, res);
  }

  if (isAction('admin_config_save')) {
    return adminConfigHandler(req, res);
  }

  if (isAction('reminder_rule_save', 'reminder_rule_delete', 'run_reminders')) {
    return remindersHandler(req, res);
  }

  if (isAction('announcement_save', 'announcement_delete')) {
    return announcementsHandler(req, res);
  }

  if (isAction('hr_letter_save', 'hr_letter_send', 'hr_letter_delete')) {
    return hrLettersHandler(req, res);
  }

  if (isAction('performance_save', 'performance_acknowledge', 'performance_delete', 'template_save', 'template_delete', 'evaluation_save', 'evaluation_acknowledge', 'evaluation_delete', 'worker_rule_save')) {
    return performanceHandler(req, res);
  }

  if (isAction('profile_update_request_create', 'profile_update_decision', 'document_create')) {
    return documentsHandler(req, res);
  }

  if (path.includes('/admin-config') || path.includes('admin_config')) {
    return adminConfigHandler(req, res);
  }

  if (path.includes('/reminders') || path.includes('reminder_rules') || path.includes('reminder_logs') || path.includes('document_checklist') || path.includes('cron_reminders')) {
    return remindersHandler(req, res);
  }

  if (path.includes('/announcements')) {
    return announcementsHandler(req, res);
  }

  if (path.includes('/hr-letters') || path.includes('hr_letters')) {
    return hrLettersHandler(req, res);
  }

  if (path.includes('/performance') || path.includes('performance_reviews') || path.includes('evaluation_templates') || path.includes('evaluations') || path.includes('worker_rules')) {
    return performanceHandler(req, res);
  }

  if (path.includes('/documents') || path.includes('profile_update_requests') || path.includes('document_signed_url')) {
    return documentsHandler(req, res);
  }

  if (path.includes('/imports') || (req.body?.action === 'import_employees') || (req.body?.action === 'import_create_accounts')) {
    return importsHandler(req, res);
  }

  if (path.includes('/worker-login') || path.includes('/worker-session') || (req.body?.action === 'worker_login') || (req.body?.action === 'worker_session')) {
    return workerAuthHandler(req, res);
  }

  if (path.includes('/system-health') || path.includes('system_health') || path.includes('/monthly-hr-report') || path.includes('monthly_hr_report') || (req.body?.action === 'system_maintenance')) {
    return systemHandler(req, res);
  }

  return employeesHandler(req, res);
}