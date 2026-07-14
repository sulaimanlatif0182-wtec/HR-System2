import supabase from './db-client.js';

const GEOFENCE_RADIUS_METERS = 100;
const MAX_GPS_ACCURACY_METERS = 250;

const ATTENDANCE_SITES = [
  {
    name: 'Factory 1',
    latitude: 2.9662584,
    longitude: 101.8372782,
    radiusMeters: GEOFENCE_RADIUS_METERS,
  },
  {
    name: 'Factory 2',
    latitude: 2.967353,
    longitude: 101.836689,
    radiusMeters: GEOFENCE_RADIUS_METERS,
  },
];

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6371000;

  const toRadians = (value) => (value * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function findNearestSite(latitude, longitude) {
  const sitesWithDistance = ATTENDANCE_SITES.map((site) => ({
    site,
    distanceMeters: getDistanceMeters(
      latitude,
      longitude,
      site.latitude,
      site.longitude
    ),
  }));

  return sitesWithDistance.sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
}

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

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
    // GPS VERIFIED CHECK IN
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
      } = req.body || {};

      if (!employee_id || !date || !check_in) {
        return res.status(400).json({
          error: 'employee_id, date and check_in are required.',
        });
      }

      const latitude = toNumber(check_in_latitude);
      const longitude = toNumber(check_in_longitude);
      const accuracy = toNumber(check_in_accuracy);

      if (latitude === null || longitude === null || accuracy === null) {
        return res.status(400).json({
          error:
            'GPS location evidence is required. Please allow location access and try again.',
        });
      }

      if (accuracy > MAX_GPS_ACCURACY_METERS) {
        return res.status(400).json({
          error: `GPS accuracy is too low (${Math.round(
            accuracy
          )}m). Please move near an open area and try again.`,
        });
      }

      const nearest = findNearestSite(latitude, longitude);

      if (!nearest) {
        return res.status(500).json({
          error: 'No approved attendance site is configured.',
        });
      }

      const site = nearest.site;
      const distanceMeters = nearest.distanceMeters;

      if (distanceMeters > site.radiusMeters) {
        return res.status(403).json({
          error: `You are outside the approved check-in area. Nearest site: ${
            site.name
          }. Distance: ${Math.round(distanceMeters)}m. Allowed radius: ${
            site.radiusMeters
          }m.`,
          nearest_site: site.name,
          distance_meters: Math.round(distanceMeters),
          allowed_radius_meters: site.radiusMeters,
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
        check_in_latitude: latitude,
        check_in_longitude: longitude,
        check_in_accuracy: accuracy,
        check_in_site: site.name,
        check_in_distance_meters: Math.round(distanceMeters),
        check_in_verified: true,
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