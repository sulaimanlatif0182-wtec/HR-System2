import { supabase } from '../../../lib/db-client.js';
import { requireAuth } from '../../../lib/requireAuth.js';
import { assertAdmin } from '../../../lib/authorize.js';
import { setCors } from '../../../lib/cors.js';
import { dbError } from '../../../lib/errors.js';
import { getFeatureFlags, isFeatureEnabled, saveFeatureFlag, saveFeatureFlags } from '../../../lib/feature-flags.js';
import { safeInsertSystemAudit } from '../employees/index.js';

export default async function handler(req, res) {
  setCors(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // Public endpoint - no auth required
    if (req.method === 'GET' && req.query.feature_flags === 'true') {
      const flags = await getFeatureFlags();
      return res.status(200).json(flags);
    }

    // my_feature_access: return empty defaults if no auth (allows UI to render while auth completes)
    if (req.method === 'GET' && req.query.my_feature_access === 'true') {
      const authUser = await requireAuth(req, res);
      if (!authUser) {
        // Return empty defaults so UI doesn't break while auth completes
        const flags = await getFeatureFlags();
        return res.status(200).json({ roleDefaults: [], overrides: [] });
      }
    }

    // All other endpoints require auth
    const authUser = await requireAuth(req, res);
    if (!authUser) return;
    if (req.method === 'GET') {
      if (req.query.feature_flags === 'true') {
        const flags = await getFeatureFlags();
        return res.status(200).json(flags);
      }

      if (req.query.feature_access === 'true') {
        const { data: roleDefaults, error: rdErr } = await supabase
          .from('role_feature_defaults')
          .select('*')
          .order('role', { ascending: true })
          .order('feature_key', { ascending: true });

        if (rdErr) return res.status(500).json({ error: rdErr.message });

        let ovQuery = supabase.from('employee_feature_access').select('*');
        if (req.query.employee_id) {
          ovQuery = ovQuery.eq('employee_id', Number(req.query.employee_id));
        }

        const { data: overrides, error: ovErr } = await ovQuery;
        if (ovErr) return res.status(500).json({ error: ovErr.message });

        return res.status(200).json({
          flags: await getFeatureFlags(),
          roleDefaults: roleDefaults || [],
          overrides: overrides || [],
        });
      }

      if (req.query.my_feature_access === 'true') {
        const { data: roleDefaults, error: rdErr } = await supabase
          .from('role_feature_defaults')
          .select('*')
          .eq('role', authUser.role);

        if (rdErr) return res.status(500).json({ error: rdErr.message });

        const { data: overrides, error: ovErr } = await supabase
          .from('employee_feature_access')
          .select('*')
          .eq('employee_id', authUser.id);

        if (ovErr) return res.status(500).json({ error: ovErr.message });

        return res.status(200).json({
          roleDefaults: roleDefaults || [],
          overrides: overrides || [],
        });
      }

      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      if (!assertAdmin(authUser, res)) return;

      const body = req.body || {};

      if (body.action === 'feature_flag_update') {
        const key = String(body.key || '').trim();
        if (!key) return res.status(400).json({ error: 'Feature flag key is required.' });

        let savedFlag;
        try {
          savedFlag = await saveFeatureFlag(
            { key, enabled: body.enabled, label: body.label, category: body.category },
            body
          );
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }

        await safeInsertSystemAudit({
          module: 'feature_flags',
          action: 'feature_flag_update',
          record_id: key,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: savedFlag,
        });

        return res.status(200).json(savedFlag);
      }

      if (body.action === 'feature_flags_bulk_update') {
        const flags = Array.isArray(body.flags) ? body.flags : [];
        if (!flags.length) return res.status(400).json({ error: 'No feature flags provided.' });

        let savedFlags;
        try {
          savedFlags = await saveFeatureFlags(flags, body);
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }

        await safeInsertSystemAudit({
          module: 'feature_flags',
          action: 'feature_flags_bulk_update',
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: savedFlags,
        });

        return res.status(200).json(savedFlags);
      }

      if (body.action === 'feature_access_bulk_update') {
        const features = Array.isArray(body.features) ? body.features : [];
        if (!features.length) return res.status(400).json({ error: 'No feature settings provided.' });

        let employeeId = body.employee_id ? Number(body.employee_id) : null;
        if (!employeeId && body.employee_no) {
          const { data: emp } = await supabase
            .from('employees')
            .select('id')
            .eq('employee_no', String(body.employee_no))
            .maybeSingle();
          if (!emp) return res.status(404).json({ error: 'Employee not found.' });
          employeeId = emp.id;
        }
        if (!employeeId) return res.status(400).json({ error: 'Employee ID is required.' });

        try {
          for (const feature of features) {
            const key = String(feature.key || '').trim();
            if (!key) continue;

            if (feature.enabled === null) {
              await supabase
                .from('employee_feature_access')
                .delete()
                .eq('employee_id', employeeId)
                .eq('feature_key', key);
            } else {
              await supabase
                .from('employee_feature_access')
                .upsert(
                  { employee_id: employeeId, feature_key: key, enabled: feature.enabled === true },
                  { onConflict: 'employee_id,feature_key' }
                );
            }
          }
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }

        await safeInsertSystemAudit({
          module: 'feature_access',
          action: 'feature_access_bulk_update',
          record_id: String(employeeId),
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: { employee_id: employeeId, features },
        });

        return res.status(200).json({ success: true });
      }

      if (body.action === 'role_defaults_bulk_update') {
        const targetRole = String(body.role || '').trim();
        const defaults = Array.isArray(body.defaults) ? body.defaults : [];
        if (!['admin', 'manager', 'employee', 'worker'].includes(targetRole)) {
          return res.status(400).json({ error: 'Invalid role.' });
        }
        if (!defaults.length) return res.status(400).json({ error: 'No defaults provided.' });

        try {
          for (const entry of defaults) {
            const key = String(entry.key || '').trim();
            if (!key) continue;
            await supabase
              .from('role_feature_defaults')
              .upsert(
                { role: targetRole, feature_key: key, enabled: entry.enabled === true },
                { onConflict: 'role,feature_key' }
              );
          }
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }

        await safeInsertSystemAudit({
          module: 'feature_access',
          action: 'role_defaults_bulk_update',
          record_id: targetRole,
          changed_by: authUser?.id || null,
          changed_by_name: authUser?.name || null,
          new_data: { role: targetRole, defaults },
        });

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Feature flags API error:', err);
    return dbError(res, err);
  }
}
