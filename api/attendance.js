import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // =========================
    // GET ATTENDANCE RECORDS
    // =========================
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false })
        .order('id', { ascending: false });

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json(data || []);
    }

    // =========================
    // CHECK IN
    // =========================
    if (req.method === 'POST') {
      const {
        employee_id,
        date,
        check_in,
        status,
        check_in_latitude,
        check_in_longitude,
        check_in_accuracy,
        check_in_site,
        check_in_distance_meters,
        check_in_verified,
      } = req.body || {};

      if (!employee_id || !date || !check_in) {
        return res.status(400).json({
          error: 'employee_id, date and check_in are required.',
        });
      }

      const { data: existing, error: existingError } = await supabase
        .from('attendance')
        .select('id, employee_id, date, check_in, check_out')
        .eq('employee_id', employee_id)
        .eq('date', date)
        .maybeSingle();

      if (existingError) {
        return res.status(500).json({
          error: existingError.message,
        });
      }

      if (existing?.check_in) {
        return res.status(409).json({
          error: 'You have already checked in today.',
          record: existing,
        });
      }

      const payload = {
        employee_id,
        date,
        check_in,
        check_out: null,
        status: status || 'present',
        check_in_latitude: check_in_latitude ?? null,
        check_in_longitude: check_in_longitude ?? null,
        check_in_accuracy: check_in_accuracy ?? null,
        check_in_site: check_in_site || null,
        check_in_distance_meters: check_in_distance_meters ?? null,
        check_in_verified: Boolean(check_in_verified),
      };

      const { data, error } = await supabase
        .from('attendance')
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
    // CHECK OUT
    // =========================
    if (req.method === 'PUT') {
      const {
        id,
        check_out,
        check_out_latitude,
        check_out_longitude,
        check_out_accuracy,
        check_out_site,
        check_out_distance_meters,
        check_out_verified,
      } = req.body || {};

      if (!id || !check_out) {
        return res.status(400).json({
          error: 'id and check_out are required.',
        });
      }

      const payload = {
        check_out,
      };

      if (check_out_latitude !== undefined) {
        payload.check_out_latitude = check_out_latitude;
      }

      if (check_out_longitude !== undefined) {
        payload.check_out_longitude = check_out_longitude;
      }

      if (check_out_accuracy !== undefined) {
        payload.check_out_accuracy = check_out_accuracy;
      }

      if (check_out_site !== undefined) {
        payload.check_out_site = check_out_site;
      }

      if (check_out_distance_meters !== undefined) {
        payload.check_out_distance_meters = check_out_distance_meters;
      }

      if (check_out_verified !== undefined) {
        payload.check_out_verified = Boolean(check_out_verified);
      }

      const { data, error } = await supabase
        .from('attendance')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json(data);
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