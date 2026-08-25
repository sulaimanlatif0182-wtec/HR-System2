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

  if (path.includes('/feature-flags') || path.includes('feature_flags') || path.includes('feature_access')) {
    return featureFlagsHandler(req, res);
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