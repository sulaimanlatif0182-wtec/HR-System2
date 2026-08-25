import { supabase } from '../../lib/db-client.js';
import { requireAuth } from '../../lib/requireAuth.js';
import { assertAdmin } from '../../lib/authorize.js';
import { setCors } from '../../lib/cors.js';
import { dbError } from '../../lib/errors.js';
import { safeInsertSystemAudit } from '../employees.js';
import { DEFAULT_ADMIN_CONFIG, cleanString } from '../../lib/employeeLogic.js';

async function getAdminConfig() {
  const { data, error } = await supabase
    .from('admin_configurations')
    .select('key, value')
    .in('key', [
      'document_required_types',
      'profile_required_fields',
      'expiry_alert_days',
      'master_departments',
      'master_locations',
      'announcement_categories',
      'performance_review_types',
    ]);

  if (error) return DEFAULT_ADMIN_CONFIG;

  const config = { ...DEFAULT_ADMIN_CONFIG };
  (data || []).forEach((row) => {
    config[row.key] = row.value;
  });

  return {
    ...DEFAULT_ADMIN_CONFIG,
    ...config,
    document_required_types: Array.isArray(config.document_required_types)
      ? config.document_required_types
      : DEFAULT_ADMIN_CONFIG.document_required_types,
    profile_required_fields: Array.isArray(config.profile_required_fields)
      ? config.profile_required_fields
      : DEFAULT_ADMIN_CONFIG.profile_required_fields,
    expiry_alert_days: Number(config.expiry_alert_days || 90),
    master_departments: Array.isArray(config.master_departments)
      ? config.master_departments
      : DEFAULT_ADMIN_CONFIG.master_departments,
    master_locations: Array.isArray(config.master_locations)
      ? config.master_locations
      : DEFAULT_ADMIN_CONFIG.master_locations,
    announcement_categories: Array.isArray(config.announcement_categories)
      ? config.announcement_categories
      : DEFAULT_ADMIN_CONFIG.announcement_categories,
    performance_review_types: Array.isArray(config.performance_review_types)
      ? config.performance_review_types
      : DEFAULT_ADMIN_CONFIG.performance_review_types,
  };
}

async function saveAdminConfig(config, actor = {}) {
  const cleanConfig = {
    ...DEFAULT_ADMIN_CONFIG,
    ...(config || {}),
    document_required_types: Array.isArray(config?.document_required_types)
      ? config.document_required_types.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.document_required_types,
    profile_required_fields: Array.isArray(config?.profile_required_fields)
      ? config.profile_required_fields.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.profile_required_fields,
    expiry_alert_days: Number(config?.expiry_alert_days || 90),
    master_departments: Array.isArray(config?.master_departments)
      ? config.master_departments.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.master_departments,
    master_locations: Array.isArray(config?.master_locations)
      ? config.master_locations.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.master_locations,
    announcement_categories: Array.isArray(config?.announcement_categories)
      ? config.announcement_categories.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.announcement_categories,
    performance_review_types: Array.isArray(config?.performance_review_types)
      ? config.performance_review_types.map(cleanString).filter(Boolean)
      : DEFAULT_ADMIN_CONFIG.performance_review_types,
  };

  const rows = Object.entries(cleanConfig).map(([key, value]) => ({
    key,
    value,
    updated_by: actor.changed_by || null,
    updated_by_name: actor.changed_by_name || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('admin_configurations').upsert(rows, { onConflict: 'key' });
  if (error) throw error;

  return cleanConfig;
}

export default async function handler(req, res) {
  setCors(res, req);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    if (req.method === 'GET') {
      if (req.query.admin_config === 'true') {
        const config = await getAdminConfig();
        return res.status(200).json(config);
      }
      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      if (!assertAdmin(authUser, res)) return;

      const body = req.body || {};

      if (body.action === 'admin_config_save') {
        const savedConfig = await saveAdminConfig(body.config || {}, body);

        await safeInsertSystemAudit({
          module: 'admin_config',
          action: 'config_update',
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: savedConfig,
        });

        return res.status(200).json(savedConfig);
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Admin config API error:', err);
    return dbError(res, err);
  }
}