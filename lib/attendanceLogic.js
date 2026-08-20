async function getSupabase() {
  return (await import('./db-client.js')).supabase;
}

export const GEOFENCE_RADIUS_METERS = 100;
export const MAX_GPS_ACCURACY_METERS = 250;

export const DEFAULT_ATTENDANCE_SETTINGS = {
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

export const DEFAULT_ATTENDANCE_SITES = [
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

export const DEFAULT_OT_WINDOWS = [
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

export async function getAttendanceSites() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('attendance_sites')
    .select('id, name, latitude, longitude, radius_meters')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error || !data || data.length === 0) {
    return DEFAULT_ATTENDANCE_SITES;
  }

  return data.map((site) => ({
    id: site.id,
    name: site.name,
    latitude: Number(site.latitude),
    longitude: Number(site.longitude),
    radiusMeters: Number(site.radius_meters) || GEOFENCE_RADIUS_METERS,
  }));
}

export async function getOtWindows() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('ot_windows')
    .select('id, start_minutes, end_minutes, overtime_hours')
    .order('start_minutes', { ascending: true });

  if (error || !data || data.length === 0) {
    return DEFAULT_OT_WINDOWS;
  }

  return data.map((window) => ({
    id: window.id,
    start: Number(window.start_minutes),
    end: Number(window.end_minutes),
    hours: Number(window.overtime_hours),
  }));
}

export function normalizeAttendanceSettings(value = {}) {
  const merged = { ...DEFAULT_ATTENDANCE_SETTINGS, ...(value || {}) };

  return {
    ...merged,
    geofence_radius_meters:
      Number(merged.geofence_radius_meters) || GEOFENCE_RADIUS_METERS,
    max_gps_accuracy_meters:
      Number(merged.max_gps_accuracy_meters) || MAX_GPS_ACCURACY_METERS,
  };
}

export function cleanTime(value, fallback) {
  const stringValue = String(value || '').trim();

  return /^\d{2}:\d{2}$/.test(stringValue) ? stringValue : fallback;
}

export function timeToMinutes(value, fallback) {
  const source = cleanTime(value, fallback);
  const [hour, minute] = source.split(':').map(Number);

  return hour * 60 + minute;
}

export async function getAttendanceSettings() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return DEFAULT_ATTENDANCE_SETTINGS;
  }

  return normalizeAttendanceSettings(data || DEFAULT_ATTENDANCE_SETTINGS);
}

export function getMalaysiaNowInfo() {
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

export function getMalaysiaMinutesNow() {
  return getMalaysiaNowInfo().minutes;
}

export function getMalaysiaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isMalaysiaSaturdayNow() {
  return getMalaysiaNowInfo().weekday === 'Sat';
}

export function getCheckInWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
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

export async function getCheckOutWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
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

  const overtimeWindows = await getOtWindows();

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

export function getLunchOutWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
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

export function getLunchInWindow(settings = DEFAULT_ATTENDANCE_SETTINGS) {
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

export function getDistanceMeters(lat1, lon1, lat2, lon2) {
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

export async function findNearestSite(latitude, longitude) {
  const sites = await getAttendanceSites();
  const sitesWithDistance = sites.map((site) => ({
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

export async function validateLocation(
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

  const nearest = await findNearestSite(latitude, longitude);

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