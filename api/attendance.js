import supabase from './db-client.js';

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

const GEOFENCE_RADIUS_METERS = 100;
const MAX_GPS_ACCURACY_METERS = 250;

const DEFAULT_ATTENDANCE_SETTINGS = {
  id: 1,
  check_in_start: '06:00',
  check_in_normal_end: '08:15',
  check_in_late_end: '09:00',
  lunch_out_start: '12:00',
  lunch_out_end: '13:00',
  lunch_in_start: '13:00',
  lunch_in_end: '14:30',
  check_out_normal_start: '17:30',
  check_out_normal_end: '17:45',
  ot_start: '17:46',
  saturday_check_out_start: '12:00',
  saturday_check_out_end: '20:00',
  geofence_radius_meters: GEOFENCE_RADIUS_METERS,
  max_gps_accuracy_meters: MAX_GPS_ACCURACY_METERS,
};

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

function normalizeAttendanceSettings(value = {}) {
  const merged = { ...DEFAULT_ATTENDANCE_SETTINGS, ...(value || {}) };

  return {
    ...merged,
    geofence_radius_meters:
      Number(merged.geofence_radius_meters) || GEOFENCE_RADIUS_METERS,
    max_gps_accuracy_meters:
      Number(merged.max_gps_accuracy_meters) || MAX_GPS_ACCURACY_METERS,
  };
}

function cleanTime(value, fallback) {
  const stringValue = String(value || '').trim();

  return /^\d{2}:\d{2}$/.test(stringValue) ? stringValue : fallback;
}

function timeToMinutes(value, fallback) {
  const source = cleanTime(value, fallback);
  const [hour, minute] = source.split(':').map(Number);

  return hour * 60 + minute;
}

async function getAttendanceSettings() {
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    // If the table has not been created yet, keep the system working with defaults.
    return DEFAULT_ATTENDANCE_SETTINGS;
  }

  return normalizeAttendanceSettings(data || DEFAULT_ATTENDANCE_SETTINGS);
}

function settingsPayloadFromBody(body = {}) {
  const settings = normalizeAttendanceSettings({
    check_in_start: cleanTime(
      body.check_in_start,
      DEFAULT_ATTENDANCE_SETTINGS.check_in_start
    ),
    check_in_normal_end: cleanTime(
      body.check_in_normal_end,
      DEFAULT_ATTENDANCE_SETTINGS.check_in_normal_end
    ),
    check_in_late_end: cleanTime(
      body.check_in_late_end,
      DEFAULT_ATTENDANCE_SETTINGS.check_in_late_end
    ),
    lunch_out_start: cleanTime(
      body.lunch_out_start,
      DEFAULT_ATTENDANCE_SETTINGS.lunch_out_start
    ),
    lunch_out_end: cleanTime(
      body.lunch_out_end,
      DEFAULT_ATTENDANCE_SETTINGS.lunch_out_end
    ),
    lunch_in_start: cleanTime(
      body.lunch_in_start,
      DEFAULT_ATTENDANCE_SETTINGS.lunch_in_start
    ),
    lunch_in_end: cleanTime(
      body.lunch_in_end,
      DEFAULT_ATTENDANCE_SETTINGS.lunch_in_end
    ),
    check_out_normal_start: cleanTime(
      body.check_out_normal_start,
      DEFAULT_ATTENDANCE_SETTINGS.check_out_normal_start
    ),
    check_out_normal_end: cleanTime(
      body.check_out_normal_end,
      DEFAULT_ATTENDANCE_SETTINGS.check_out_normal_end
    ),
    ot_start: cleanTime(body.ot_start, DEFAULT_ATTENDANCE_SETTINGS.ot_start),
    saturday_check_out_start: cleanTime(
      body.saturday_check_out_start,
      DEFAULT_ATTENDANCE_SETTINGS.saturday_check_out_start
    ),
    saturday_check_out_end: cleanTime(
      body.saturday_check_out_end,
      DEFAULT_ATTENDANCE_SETTINGS.saturday_check_out_end
    ),
    geofence_radius_meters:
      Number(body.geofence_radius_meters) || GEOFENCE_RADIUS_METERS,
    max_gps_accuracy_meters:
      Number(body.max_gps_accuracy_meters) || MAX_GPS_ACCURACY_METERS,
  });

  return {
    id: 1,
    check_in_start: settings.check_in_start,
    check_in_normal_end: settings.check_in_normal_end,
    check_in_late_end: settings.check_in_late_end,
    lunch_out_start: settings.lunch_out_start,
    lunch_out_end: settings.lunch_out_end,
    lunch_in_start: settings.lunch_in_start,
    lunch_in_end: settings.lunch_in_end,
    check_out_normal_start: settings.check_out_normal_start,
    check_out_normal_end: settings.check_out_normal_end,
    ot_start: settings.ot_start,
    saturday_check_out_start: settings.saturday_check_out_start,
    saturday_check_out_end: settings.saturday_check_out_end,
    geofence_radius_meters: settings.geofence_radius_meters,
    max_gps_accuracy_meters: settings.max_gps_accuracy_meters,
    updated_by: body.changed_by || null,
    updated_by_name: body.changed_by_name || null,
    updated_at: new Date().toISOString(),
  };
}

function getMalaysiaNowInfo() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date());

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const hourPart = parts.find((part) => part.type === 'hour')?.value ?? '0';
  const minutePart = parts.find((part) => part.type === 'minute')?.value ?? '0';

  const hour = Number(hourPart) % 24;
  const minute = Number(minutePart);

  return {
    weekday,
    minutes: hour * 60 + minute,
  };
}

function getMalaysiaMinutesNow() {
  return getMalaysiaNowInfo().minutes;
}

function isMalaysiaSaturdayNow() {
  return getMalaysiaNowInfo().weekday === 'Sat';
}

function getCheckInWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
  const now = getMalaysiaMinutesNow();

  const normalStart = timeToMinutes(
    settings.check_in_start,
    DEFAULT_ATTENDANCE_SETTINGS.check_in_start
  );
  const normalEnd = timeToMinutes(
    settings.check_in_normal_end,
    DEFAULT_ATTENDANCE_SETTINGS.check_in_normal_end
  );
  const lateEnd = timeToMinutes(
    settings.check_in_late_end,
    DEFAULT_ATTENDANCE_SETTINGS.check_in_late_end
  );

  if (now < normalStart) {
    return {
      allowed: false,
      type: 'not_open',
      status: 'closed',
      label: `Check-in opens at ${settings.check_in_start}`,
      isLate: false,
    };
  }

  if (now <= normalEnd) {
    return {
      allowed: true,
      type: 'normal',
      status: 'present',
      label: 'Normal Check In',
      isLate: false,
    };
  }

  if (now <= lateEnd) {
    return {
      allowed: true,
      type: 'late',
      status: 'late',
      label: 'Late Check In',
      isLate: true,
    };
  }

  return {
    allowed: false,
    type: 'missed',
    status: 'absent',
    label: 'Check-in window closed',
    isLate: false,
  };
}

function getCheckOutWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
  const now = getMalaysiaMinutesNow();

  if (isMalaysiaSaturdayNow()) {
    const saturdayStart = timeToMinutes(
      settings.saturday_check_out_start,
      DEFAULT_ATTENDANCE_SETTINGS.saturday_check_out_start
    );
    const saturdayEnd = timeToMinutes(
      settings.saturday_check_out_end,
      DEFAULT_ATTENDANCE_SETTINGS.saturday_check_out_end
    );

    if (now < saturdayStart) {
      return {
        allowed: false,
        type: 'not_open',
        label: `Saturday check-out opens at ${settings.saturday_check_out_start}`,
        overtimeHours: 0,
      };
    }

    if (now <= saturdayEnd) {
      return {
        allowed: true,
        type: 'saturday',
        label: 'Saturday Check Out',
        overtimeHours: 0,
      };
    }

    return {
      allowed: false,
      type: 'closed',
      label: `Saturday check-out window closed at ${settings.saturday_check_out_end}`,
      overtimeHours: 0,
    };
  }

  const normalStart = timeToMinutes(
    settings.check_out_normal_start,
    DEFAULT_ATTENDANCE_SETTINGS.check_out_normal_start
  );
  const normalEnd = timeToMinutes(
    settings.check_out_normal_end,
    DEFAULT_ATTENDANCE_SETTINGS.check_out_normal_end
  );
  const otStart = timeToMinutes(
    settings.ot_start,
    DEFAULT_ATTENDANCE_SETTINGS.ot_start
  );

  if (now < normalStart) {
    return {
      allowed: false,
      type: 'not_open',
      label: `Check-out opens at ${settings.check_out_normal_start}`,
      overtimeHours: 0,
    };
  }

  if (now >= normalStart && now <= normalEnd) {
    return {
      allowed: true,
      type: 'normal',
      label: 'Normal Check Out',
      overtimeHours: 0,
    };
  }

  if (now < otStart) {
    return {
      allowed: false,
      type: 'not_open',
      label: `OT check-out starts at ${settings.ot_start}`,
      overtimeHours: 0,
    };
  }

  const overtimeWindows = [
    { start: 17 * 60 + 46, end: 18 * 60 + 15, hours: 0.5 },
    { start: 18 * 60 + 16, end: 18 * 60 + 45, hours: 1 },
    { start: 18 * 60 + 46, end: 19 * 60 + 15, hours: 1.5 },
    { start: 19 * 60 + 16, end: 19 * 60 + 45, hours: 2 },
    { start: 19 * 60 + 46, end: 20 * 60 + 15, hours: 2.5 },
    { start: 20 * 60 + 16, end: 20 * 60 + 45, hours: 3 },
    { start: 20 * 60 + 46, end: 21 * 60 + 15, hours: 3.5 },
    { start: 21 * 60 + 16, end: 21 * 60 + 45, hours: 4 },
    { start: 21 * 60 + 46, end: 22 * 60 + 15, hours: 4.5 },
    { start: 22 * 60 + 16, end: 22 * 60 + 45, hours: 5 },
    { start: 22 * 60 + 46, end: 23 * 60 + 15, hours: 5.5 },
    { start: 23 * 60 + 16, end: 23 * 60 + 45, hours: 6 },
    { start: 23 * 60 + 46, end: 24 * 60, hours: 6.5 },
  ];

  const matchedWindow = overtimeWindows.find(
    (window) => now >= window.start && now <= window.end
  );

  if (matchedWindow) {
    return {
      allowed: true,
      type: 'ot',
      label: `OT ${matchedWindow.hours} Check Out`,
      overtimeHours: matchedWindow.hours,
    };
  }

  return {
    allowed: false,
    type: 'closed',
    label: 'Check-out window closed',
    overtimeHours: 0,
  };
}

function getLunchOutWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
  const now = getMalaysiaMinutesNow();

  const lunchOutStart = timeToMinutes(
    settings.lunch_out_start,
    DEFAULT_ATTENDANCE_SETTINGS.lunch_out_start
  );
  const lunchOutEnd = timeToMinutes(
    settings.lunch_out_end,
    DEFAULT_ATTENDANCE_SETTINGS.lunch_out_end
  );

  if (now < lunchOutStart) {
    return {
      allowed: false,
      label: `Lunch Out opens at ${settings.lunch_out_start}`,
    };
  }

  if (now <= lunchOutEnd) {
    return {
      allowed: true,
      label: 'Lunch Out',
    };
  }

  return {
    allowed: false,
    label: 'Lunch Out window closed',
  };
}

function getLunchInWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
  const now = getMalaysiaMinutesNow();

  const lunchInStart = timeToMinutes(
    settings.lunch_in_start,
    DEFAULT_ATTENDANCE_SETTINGS.lunch_in_start
  );
  const lunchInEnd = timeToMinutes(
    settings.lunch_in_end,
    DEFAULT_ATTENDANCE_SETTINGS.lunch_in_end
  );

  if (now < lunchInStart) {
    return {
      allowed: false,
      label: `Lunch In opens at ${settings.lunch_in_start}`,
    };
  }

  if (now <= lunchInEnd) {
    return {
      allowed: true,
      label: 'Lunch In',
    };
  }

  return {
    allowed: false,
    label: `Lunch In window closed at ${settings.lunch_in_end}`,
  };
}

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

function nullableTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function validateLocation(
  latitude,
  longitude,
  accuracy,
  actionLabel,
  settings = DEFAULT_ATTENDANCE_SETTINGS
) {
  if (latitude === null || longitude === null || accuracy === null) {
    return {
      ok: false,
      status: 400,
      error: `GPS location evidence is required for ${actionLabel}. Please allow location access and try again.`,
    };
  }

  const maxAccuracy = Number(
    settings.max_gps_accuracy_meters || MAX_GPS_ACCURACY_METERS
  );

  if (accuracy > maxAccuracy) {
    return {
      ok: false,
      status: 400,
      error: `GPS accuracy is too low (${Math.round(
        accuracy
      )}m). Please move near an open area and try again.`,
    };
  }

  const nearest = findNearestSite(latitude, longitude);

  if (!nearest) {
    return {
      ok: false,
      status: 500,
      error: 'No approved attendance site is configured.',
    };
  }

  const site = nearest.site;
  const distanceMeters = nearest.distanceMeters;
  const allowedRadius = Number(
    settings.geofence_radius_meters || site.radiusMeters
  );

  if (distanceMeters > allowedRadius) {
    return {
      ok: false,
      status: 403,
      error: `You are outside the approved ${actionLabel} area. Nearest site: ${
        site.name
      }. Distance: ${Math.round(distanceMeters)}m. Allowed radius: ${
        allowedRadius
      }m.`,
      nearest_site: site.name,
      distance_meters: Math.round(distanceMeters),
      allowed_radius_meters: allowedRadius,
    };
  }

  return {
    ok: true,
    site,
    distanceMeters,
  };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function diffMinutes(later, earlier) {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60000));
}

async function verifyDeviceAuthToken({ employeeId, token, purpose }) {
  if (!employeeId || !token) {
    return {
      ok: false,
      status: 403,
      error:
        'Approved attendance device verification is required before this attendance action.',
    };
  }

  const { data: tokenRow, error: tokenError } = await supabase
    .from('device_auth_tokens')
    .select('*')
    .eq('token', token)
    .eq('employee_id', Number(employeeId))
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (tokenError) {
    return {
      ok: false,
      status: 500,
      error: tokenError.message,
    };
  }

  if (!tokenRow) {
    return {
      ok: false,
      status: 403,
      error: 'Device verification expired or invalid. Please try again.',
    };
  }

  const { data: device, error: deviceError } = await supabase
    .from('employee_devices')
    .select('*')
    .eq('id', tokenRow.device_id)
    .eq('employee_id', Number(employeeId))
    .eq('status', 'approved')
    .is('revoked_at', null)
    .maybeSingle();

  if (deviceError) {
    return {
      ok: false,
      status: 500,
      error: deviceError.message,
    };
  }

  if (!device) {
    return {
      ok: false,
      status: 403,
      error: 'Approved attendance device not found.',
    };
  }

  const { error: updateError } = await supabase
    .from('device_auth_tokens')
    .update({
      used_at: new Date().toISOString(),
    })
    .eq('id', tokenRow.id);

  if (updateError) {
    return {
      ok: false,
      status: 500,
      error: updateError.message,
    };
  }

  return {
    ok: true,
    device,
    token: tokenRow,
  };
}

async function selectAuditRows(table, select = '*', orderColumn = 'created_at') {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .order(orderColumn, { ascending: false })
    .limit(500);

  if (error) return [];

  return data || [];
}

async function buildAuditLogs() {
  const [systemRows, attendanceRows, leaveBalanceRows, leaveAdjustmentRows] =
    await Promise.all([
      selectAuditRows('system_audit_logs'),
      selectAuditRows('attendance_audit_logs'),
      selectAuditRows('leave_balance_audit_logs'),
      selectAuditRows('leave_adjustments'),
    ]);

  const systemLogs = systemRows.map((row) => ({
    id: `system-${row.id}`,
    source_table: 'system_audit_logs',
    module: row.module || 'general',
    action: row.action || 'unknown',
    record_id: row.record_id || null,
    employee_id: row.employee_id || null,
    changed_by: row.changed_by || null,
    changed_by_name: row.changed_by_name || null,
    old_data: row.old_data || null,
    new_data: row.new_data || null,
    reason: row.reason || null,
    created_at: row.created_at,
  }));

  const attendanceLogs = attendanceRows.map((row) => ({
    id: `attendance-${row.id}`,
    source_table: 'attendance_audit_logs',
    module: 'attendance',
    action: row.action || 'manual_correction',
    record_id: row.attendance_id || null,
    employee_id: row.employee_id || null,
    changed_by: row.changed_by || null,
    changed_by_name: row.changed_by_name || null,
    old_data: row.old_data || null,
    new_data: row.new_data || null,
    reason: row.reason || null,
    created_at: row.created_at,
  }));

  const leaveBalanceLogs = leaveBalanceRows.map((row) => ({
    id: `leave-balance-${row.id}`,
    source_table: 'leave_balance_audit_logs',
    module: 'leave',
    action: 'balance_update',
    record_id: row.id || null,
    employee_id: row.employee_id || null,
    changed_by: row.changed_by || null,
    changed_by_name: row.changed_by_name || null,
    old_data: {
      entitlement: row.old_entitlement,
      used: row.old_used,
      balance: row.old_balance,
    },
    new_data: {
      entitlement: row.new_entitlement,
      used: row.new_used,
      balance: row.new_balance,
      leave_type: row.leave_type,
    },
    reason: row.reason || null,
    created_at: row.created_at,
  }));

  const leaveAdjustmentLogs = leaveAdjustmentRows.map((row) => ({
    id: `leave-adjustment-${row.id}`,
    source_table: 'leave_adjustments',
    module: 'leave',
    action: 'balance_adjustment',
    record_id: row.id || null,
    employee_id: row.employee_id || null,
    changed_by: row.created_by || null,
    changed_by_name: row.created_by_name || null,
    old_data: null,
    new_data: {
      leave_type: row.leave_type,
      adjustment_days: row.adjustment_days,
    },
    reason: row.reason || null,
    created_at: row.created_at,
  }));

  return [...systemLogs, ...attendanceLogs, ...leaveBalanceLogs, ...leaveAdjustmentLogs]
    .filter((row) => row.created_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 1000);
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
      if (req.query?.audit_logs === '1') {
        const logs = await buildAuditLogs();

        return res.status(200).json(logs);
      }

      if (req.query?.settings === '1') {
        const settings = await getAttendanceSettings();

        return res.status(200).json(settings);
      }

      if (req.query?.holidays === '1') {
        const { data, error } = await supabase
          .from('company_holidays')
          .select('*')
          .order('holiday_date', { ascending: true })
          .order('id', { ascending: true });

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(data || []);
      }

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
    // GPS + DEVICE VERIFIED CHECK IN
    // =========================
    if (req.method === 'POST') {
      const {
        employee_id,
        date,
        check_in,
        check_in_latitude,
        check_in_longitude,
        check_in_accuracy,
        device_auth_token,
      } = req.body || {};

      if (!employee_id || !date || !check_in) {
        return res.status(400).json({
          error: 'employee_id, date and check_in are required.',
        });
      }

      const attendanceSettings = await getAttendanceSettings();
      const checkInWindow = getCheckInWindow(attendanceSettings);

      if (!checkInWindow.allowed) {
        return res.status(403).json({
          error: checkInWindow.label,
        });
      }

      const deviceResult = await verifyDeviceAuthToken({
        employeeId: employee_id,
        token: device_auth_token,
        purpose: 'attendance_check_in',
      });

      if (!deviceResult.ok) {
        return res.status(deviceResult.status).json({
          error: deviceResult.error,
        });
      }

      const latitude = toNumber(check_in_latitude);
      const longitude = toNumber(check_in_longitude);
      const accuracy = toNumber(check_in_accuracy);

      const locationResult = validateLocation(
        latitude,
        longitude,
        accuracy,
        'check-in',
        attendanceSettings
      );

      if (!locationResult.ok) {
        return res.status(locationResult.status).json(locationResult);
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
        status: checkInWindow.status,
        check_in_type: checkInWindow.type,
        is_late: Boolean(checkInWindow.isLate),
        overtime_hours: 0,
        check_in_latitude: latitude,
        check_in_longitude: longitude,
        check_in_accuracy: accuracy,
        check_in_site: locationResult.site.name,
        check_in_distance_meters: Math.round(locationResult.distanceMeters),
        check_in_verified: true,
        check_in_device_id: deviceResult.device.id,
        check_in_webauthn_verified: true,
        lunch_status: 'not_taken',
        lunch_break_minutes: 0,
        lunch_late_minutes: 0,
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
    // PUT ACTIONS
    // =========================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const action = body.action || 'check_out';

      // =========================
      // ATTENDANCE SETTINGS UPDATE
      // =========================
      if (action === 'settings_update') {
        const payload = settingsPayloadFromBody(body);

        const { data, error } = await supabase
          .from('attendance_settings')
          .upsert(payload, { onConflict: 'id' })
          .select()
          .single();

        if (error) {
          return res.status(500).json({
            error:
              error.message ||
              'Failed to save attendance settings. Please make sure attendance_settings table exists.',
          });
        }

        await safeInsertSystemAudit({
          module: 'attendance',
          action: 'settings_update',
          record_id: data?.id || 1,
          changed_by: body.changed_by || null,
          changed_by_name: body.changed_by_name || null,
          new_data: data,
        });

        return res.status(200).json(normalizeAttendanceSettings(data));
      }

      // =========================
      // HOLIDAY UPSERT
      // =========================
      if (action === 'holiday_upsert') {
        const {
          id,
          holiday_date,
          name,
          type,
          is_working_day,
          notes,
          changed_by,
          changed_by_name,
        } = body;

        if (!holiday_date || !name || !String(name).trim()) {
          return res.status(400).json({
            error: 'Holiday date and name are required.',
          });
        }

        const payload = {
          holiday_date,
          name: String(name).trim(),
          type: type || 'public_holiday',
          is_working_day: Boolean(is_working_day),
          notes: notes ? String(notes).trim() : null,
          updated_at: new Date().toISOString(),
        };

        let query;

        if (id) {
          query = supabase
            .from('company_holidays')
            .update(payload)
            .eq('id', Number(id));
        } else {
          query = supabase.from('company_holidays').insert({
            ...payload,
            created_by: changed_by || null,
            created_by_name: changed_by_name || null,
          });
        }

        const { data, error } = await query.select().single();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        await safeInsertSystemAudit({
          module: 'holiday',
          action: id ? 'holiday_update' : 'holiday_create',
          record_id: data?.id || null,
          changed_by: changed_by || null,
          changed_by_name: changed_by_name || null,
          new_data: data,
        });

        return res.status(200).json(data);
      }

      // =========================
      // HOLIDAY DELETE
      // =========================
      if (action === 'holiday_delete') {
        const { id } = body;

        if (!id) {
          return res.status(400).json({
            error: 'id is required.',
          });
        }

        const { error } = await supabase
          .from('company_holidays')
          .delete()
          .eq('id', Number(id));

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        await safeInsertSystemAudit({
          module: 'holiday',
          action: 'holiday_delete',
          record_id: Number(id),
          changed_by: body.changed_by || null,
          changed_by_name: body.changed_by_name || null,
          old_data: { id: Number(id) },
        });

        return res.status(200).json({ ok: true });
      }

      // =========================
      // MANUAL CORRECTION
      // =========================
      if (action === 'manual_correction') {
        const {
          id,
          changed_by,
          changed_by_name,
          reason,
          date,
          status,
          check_in,
          lunch_out,
          lunch_in,
          lunch_expected_return,
          check_out,
          overtime_hours,
          lunch_break_minutes,
          lunch_late_minutes,
          lunch_status,
        } = body;

        if (!id) {
          return res.status(400).json({
            error: 'id is required.',
          });
        }

        if (!reason || !String(reason).trim()) {
          return res.status(400).json({
            error: 'Correction reason is required.',
          });
        }

        const { data: existing, error: existingError } = await supabase
          .from('attendance')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (existingError) {
          return res.status(500).json({
            error: existingError.message,
          });
        }

        if (!existing) {
          return res.status(404).json({
            error: 'Attendance record not found.',
          });
        }

        const updatePayload = {};

        if (date !== undefined) updatePayload.date = date;
        if (status !== undefined) updatePayload.status = status;

        if (check_in !== undefined) {
          updatePayload.check_in = nullableTimestamp(check_in);
        }

        if (lunch_out !== undefined) {
          updatePayload.lunch_out = nullableTimestamp(lunch_out);
        }

        if (lunch_in !== undefined) {
          updatePayload.lunch_in = nullableTimestamp(lunch_in);
        }

        if (lunch_expected_return !== undefined) {
          updatePayload.lunch_expected_return =
            nullableTimestamp(lunch_expected_return);
        }

        if (check_out !== undefined) {
          updatePayload.check_out = nullableTimestamp(check_out);
        }

        if (overtime_hours !== undefined) {
          updatePayload.overtime_hours = nullableNumber(overtime_hours) ?? 0;
        }

        if (lunch_break_minutes !== undefined) {
          updatePayload.lunch_break_minutes =
            nullableNumber(lunch_break_minutes) ?? 0;
        }

        if (lunch_late_minutes !== undefined) {
          updatePayload.lunch_late_minutes = nullableNumber(lunch_late_minutes) ?? 0;
        }

        if (lunch_status !== undefined) {
          updatePayload.lunch_status = lunch_status;
        }

        const { data, error } = await supabase
          .from('attendance')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        await supabase.from('attendance_audit_logs').insert({
          attendance_id: existing.id,
          employee_id: existing.employee_id,
          changed_by: changed_by || null,
          changed_by_name: changed_by_name || null,
          action: 'manual_correction',
          old_data: existing,
          new_data: data,
          reason: String(reason).trim(),
        });

        return res.status(200).json(data);
      }

      // =========================
      // LUNCH OUT
      // =========================
      if (action === 'lunch_out') {
        const { id, latitude, longitude, accuracy, device_auth_token } = body;

        if (!id) {
          return res.status(400).json({
            error: 'id is required.',
          });
        }

        const attendanceSettings = await getAttendanceSettings();
        const lunchWindow = getLunchOutWindow(attendanceSettings);

        if (!lunchWindow.allowed) {
          return res.status(403).json({
            error: lunchWindow.label,
          });
        }

        const lat = toNumber(latitude);
        const lng = toNumber(longitude);
        const acc = toNumber(accuracy);

        const locationResult = validateLocation(
          lat,
          lng,
          acc,
          'lunch-out',
          attendanceSettings
        );

        if (!locationResult.ok) {
          return res.status(locationResult.status).json(locationResult);
        }

        const { data: existing, error: existingError } = await supabase
          .from('attendance')
          .select('id, employee_id, check_in, check_out, lunch_out')
          .eq('id', id)
          .maybeSingle();

        if (existingError) {
          return res.status(500).json({
            error: existingError.message,
          });
        }

        if (!existing) {
          return res.status(404).json({
            error: 'Attendance record not found.',
          });
        }

        if (!existing.check_in) {
          return res.status(400).json({
            error: 'You must check in before lunch out.',
          });
        }

        if (existing.check_out) {
          return res.status(400).json({
            error: 'You already checked out.',
          });
        }

        if (existing.lunch_out) {
          return res.status(409).json({
            error: 'Lunch Out already recorded.',
          });
        }

        const deviceResult = await verifyDeviceAuthToken({
          employeeId: existing.employee_id,
          token: device_auth_token,
          purpose: 'attendance_lunch_out',
        });

        if (!deviceResult.ok) {
          return res.status(deviceResult.status).json({
            error: deviceResult.error,
          });
        }

        const lunchOutDate = new Date();
        const expectedReturn = addMinutes(lunchOutDate, 60);

        const { data, error } = await supabase
          .from('attendance')
          .update({
            lunch_out: lunchOutDate.toISOString(),
            lunch_expected_return: expectedReturn.toISOString(),
            lunch_status: 'out',
            lunch_out_latitude: lat,
            lunch_out_longitude: lng,
            lunch_out_accuracy: acc,
            lunch_out_site: locationResult.site.name,
            lunch_out_distance_meters: Math.round(locationResult.distanceMeters),
            lunch_out_verified: true,
            lunch_out_device_id: deviceResult.device.id,
            lunch_out_webauthn_verified: true,
          })
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

      // =========================
      // LUNCH IN
      // =========================
      if (action === 'lunch_in') {
        const { id, latitude, longitude, accuracy, device_auth_token } = body;

        if (!id) {
          return res.status(400).json({
            error: 'id is required.',
          });
        }

        const attendanceSettings = await getAttendanceSettings();
        const lunchWindow = getLunchInWindow(attendanceSettings);

        if (!lunchWindow.allowed) {
          return res.status(403).json({
            error: lunchWindow.label,
          });
        }

        const lat = toNumber(latitude);
        const lng = toNumber(longitude);
        const acc = toNumber(accuracy);

        const locationResult = validateLocation(
          lat,
          lng,
          acc,
          'lunch-in',
          attendanceSettings
        );

        if (!locationResult.ok) {
          return res.status(locationResult.status).json(locationResult);
        }

        const { data: existing, error: existingError } = await supabase
          .from('attendance')
          .select(
            'id, employee_id, check_in, check_out, lunch_out, lunch_in, lunch_expected_return'
          )
          .eq('id', id)
          .maybeSingle();

        if (existingError) {
          return res.status(500).json({
            error: existingError.message,
          });
        }

        if (!existing) {
          return res.status(404).json({
            error: 'Attendance record not found.',
          });
        }

        if (!existing.check_in) {
          return res.status(400).json({
            error: 'You must check in before lunch in.',
          });
        }

        if (existing.check_out) {
          return res.status(400).json({
            error: 'You already checked out.',
          });
        }

        if (!existing.lunch_out) {
          return res.status(400).json({
            error: 'You must Lunch Out before Lunch In.',
          });
        }

        if (existing.lunch_in) {
          return res.status(409).json({
            error: 'Lunch In already recorded.',
          });
        }

        const deviceResult = await verifyDeviceAuthToken({
          employeeId: existing.employee_id,
          token: device_auth_token,
          purpose: 'attendance_lunch_in',
        });

        if (!deviceResult.ok) {
          return res.status(deviceResult.status).json({
            error: deviceResult.error,
          });
        }

        const lunchInDate = new Date();
        const lunchOutDate = new Date(existing.lunch_out);
        const expectedReturnDate = existing.lunch_expected_return
          ? new Date(existing.lunch_expected_return)
          : addMinutes(lunchOutDate, 60);

        const breakMinutes = diffMinutes(lunchInDate, lunchOutDate);
        const lateMinutes = diffMinutes(lunchInDate, expectedReturnDate);

        const { data, error } = await supabase
          .from('attendance')
          .update({
            lunch_in: lunchInDate.toISOString(),
            lunch_break_minutes: breakMinutes,
            lunch_late_minutes: lateMinutes,
            lunch_status: lateMinutes > 0 ? 'late_return' : 'returned',
            lunch_in_latitude: lat,
            lunch_in_longitude: lng,
            lunch_in_accuracy: acc,
            lunch_in_site: locationResult.site.name,
            lunch_in_distance_meters: Math.round(locationResult.distanceMeters),
            lunch_in_verified: true,
            lunch_in_device_id: deviceResult.device.id,
            lunch_in_webauthn_verified: true,
          })
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

      // =========================
      // CHECK OUT
      // =========================
      const {
        id,
        check_out,
        check_out_latitude,
        check_out_longitude,
        check_out_accuracy,
        device_auth_token,
      } = body;

      if (!id || !check_out) {
        return res.status(400).json({
          error: 'id and check_out are required.',
        });
      }

      const attendanceSettings = await getAttendanceSettings();
      const checkOutWindow = getCheckOutWindow(attendanceSettings);

      if (!checkOutWindow.allowed) {
        return res.status(403).json({
          error: checkOutWindow.label,
        });
      }

      const latitude = toNumber(check_out_latitude);
      const longitude = toNumber(check_out_longitude);
      const accuracy = toNumber(check_out_accuracy);

      const locationResult = validateLocation(
        latitude,
        longitude,
        accuracy,
        'check-out',
        attendanceSettings
      );

      if (!locationResult.ok) {
        return res.status(locationResult.status).json(locationResult);
      }

      const { data: existing, error: existingError } = await supabase
        .from('attendance')
        .select(
          'id, employee_id, check_in, check_out, lunch_out, lunch_in, lunch_expected_return'
        )
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        return res.status(500).json({
          error: existingError.message,
        });
      }

      if (!existing) {
        return res.status(404).json({
          error: 'Attendance record not found.',
        });
      }

      if (!existing.check_in) {
        return res.status(400).json({
          error: 'You must check in before checking out.',
        });
      }

      if (existing.check_out) {
        return res.status(409).json({
          error: 'You have already checked out.',
          record: existing,
        });
      }

      const deviceResult = await verifyDeviceAuthToken({
        employeeId: existing.employee_id,
        token: device_auth_token,
        purpose: 'attendance_check_out',
      });

      if (!deviceResult.ok) {
        return res.status(deviceResult.status).json({
          error: deviceResult.error,
        });
      }

      let lunchBreakMinutes = 0;
      let lunchLateMinutes = 0;
      let lunchStatus = existing.lunch_out ? 'missing_lunch_in' : 'not_taken';

      if (existing.lunch_out && existing.lunch_in) {
        const lunchOutDate = new Date(existing.lunch_out);
        const lunchInDate = new Date(existing.lunch_in);
        const expectedReturnDate = existing.lunch_expected_return
          ? new Date(existing.lunch_expected_return)
          : addMinutes(lunchOutDate, 60);

        lunchBreakMinutes = diffMinutes(lunchInDate, lunchOutDate);
        lunchLateMinutes = diffMinutes(lunchInDate, expectedReturnDate);
        lunchStatus = lunchLateMinutes > 0 ? 'late_return' : 'returned';
      }

      if (existing.lunch_out && !existing.lunch_in) {
        const lunchOutDate = new Date(existing.lunch_out);
        const checkOutDate = new Date(check_out);
        const expectedReturnDate = existing.lunch_expected_return
          ? new Date(existing.lunch_expected_return)
          : addMinutes(lunchOutDate, 60);

        lunchBreakMinutes = diffMinutes(checkOutDate, lunchOutDate);
        lunchLateMinutes = diffMinutes(checkOutDate, expectedReturnDate);
        lunchStatus = 'missing_lunch_in';
      }

      const payload = {
        check_out,
        check_out_type: checkOutWindow.type,
        overtime_hours: Number(checkOutWindow.overtimeHours),
        check_out_latitude: latitude,
        check_out_longitude: longitude,
        check_out_accuracy: accuracy,
        check_out_site: locationResult.site.name,
        check_out_distance_meters: Math.round(locationResult.distanceMeters),
        check_out_verified: true,
        check_out_device_id: deviceResult.device.id,
        check_out_webauthn_verified: true,
        lunch_break_minutes: lunchBreakMinutes,
        lunch_late_minutes: lunchLateMinutes,
        lunch_status: lunchStatus,
      };

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
      error:
        err?.message ||
        err?.details ||
        err?.hint ||
        err?.code ||
        JSON.stringify(err) ||
        'Internal server error.',
    });
  }
}
