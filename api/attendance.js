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

function getMalaysiaMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date());

  const hourPart = parts.find((part) => part.type === 'hour')?.value ?? '0';
  const minutePart = parts.find((part) => part.type === 'minute')?.value ?? '0';

  const hour = Number(hourPart) % 24;
  const minute = Number(minutePart);

  return hour * 60 + minute;
}

function getCheckInWindow() {
  const now = getMalaysiaMinutesNow();

  const normalStart = 6 * 60;
  const normalEnd = 8 * 60 + 15;
  const lateEnd = 9 * 60;

  if (now < normalStart) {
    return {
      allowed: false,
      type: 'not_open',
      status: 'closed',
      label: 'Check-in opens at 06:00',
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

function getCheckOutWindow() {
  const now = getMalaysiaMinutesNow();

  const normalStart = 17 * 60 + 30;
  const normalEnd = 17 * 60 + 45;
  const otStart = 17 * 60 + 46;

  if (now < normalStart) {
    return {
      allowed: false,
      type: 'not_open',
      label: 'Check-out opens at 17:30',
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
      label: 'OT check-out starts at 17:46',
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

function getLunchOutWindow() {
  const now = getMalaysiaMinutesNow();

  const lunchOutStart = 12 * 60; // 12:00
  const lunchOutEnd = 13 * 60; // 13:00

  if (now < lunchOutStart) {
    return {
      allowed: false,
      label: 'Lunch Out opens at 12:00',
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

function getLunchInWindow() {
  const now = getMalaysiaMinutesNow();

  const lunchInStart = 13 * 60; // 13:00

  if (now < lunchInStart) {
    return {
      allowed: false,
      label: 'Lunch In opens at 13:00',
    };
  }

  return {
    allowed: true,
    label: 'Lunch In',
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

function validateLocation(latitude, longitude, accuracy, actionLabel) {
  if (latitude === null || longitude === null || accuracy === null) {
    return {
      ok: false,
      status: 400,
      error: `GPS location evidence is required for ${actionLabel}. Please allow location access and try again.`,
    };
  }

  if (accuracy > MAX_GPS_ACCURACY_METERS) {
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

  if (distanceMeters > site.radiusMeters) {
    return {
      ok: false,
      status: 403,
      error: `You are outside the approved ${actionLabel} area. Nearest site: ${
        site.name
      }. Distance: ${Math.round(distanceMeters)}m. Allowed radius: ${
        site.radiusMeters
      }m.`,
      nearest_site: site.name,
      distance_meters: Math.round(distanceMeters),
      allowed_radius_meters: site.radiusMeters,
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
        check_in_latitude,
        check_in_longitude,
        check_in_accuracy,
      } = req.body || {};

      if (!employee_id || !date || !check_in) {
        return res.status(400).json({
          error: 'employee_id, date and check_in are required.',
        });
      }

      const checkInWindow = getCheckInWindow();

      if (!checkInWindow.allowed) {
        return res.status(403).json({
          error: checkInWindow.label,
        });
      }

      const latitude = toNumber(check_in_latitude);
      const longitude = toNumber(check_in_longitude);
      const accuracy = toNumber(check_in_accuracy);

      const locationResult = validateLocation(
        latitude,
        longitude,
        accuracy,
        'check-in'
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
    // PUT ACTIONS:
    // CHECK OUT / LUNCH OUT / LUNCH IN
    // =========================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const action = body.action || 'check_out';

      // =========================
      // LUNCH OUT
      // =========================
      if (action === 'lunch_out') {
        const { id, latitude, longitude, accuracy } = body;

        if (!id) {
          return res.status(400).json({
            error: 'id is required.',
          });
        }

        const lunchWindow = getLunchOutWindow();

        if (!lunchWindow.allowed) {
          return res.status(403).json({
            error: lunchWindow.label,
          });
        }

        const lat = toNumber(latitude);
        const lng = toNumber(longitude);
        const acc = toNumber(accuracy);

        const locationResult = validateLocation(lat, lng, acc, 'lunch-out');

        if (!locationResult.ok) {
          return res.status(locationResult.status).json(locationResult);
        }

        const { data: existing, error: existingError } = await supabase
          .from('attendance')
          .select('id, check_in, check_out, lunch_out')
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
        const { id, latitude, longitude, accuracy } = body;

        if (!id) {
          return res.status(400).json({
            error: 'id is required.',
          });
        }

        const lunchWindow = getLunchInWindow();

        if (!lunchWindow.allowed) {
          return res.status(403).json({
            error: lunchWindow.label,
          });
        }

        const lat = toNumber(latitude);
        const lng = toNumber(longitude);
        const acc = toNumber(accuracy);

        const locationResult = validateLocation(lat, lng, acc, 'lunch-in');

        if (!locationResult.ok) {
          return res.status(locationResult.status).json(locationResult);
        }

        const { data: existing, error: existingError } = await supabase
          .from('attendance')
          .select(
            'id, check_in, check_out, lunch_out, lunch_in, lunch_expected_return'
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
      } = body;

      if (!id || !check_out) {
        return res.status(400).json({
          error: 'id and check_out are required.',
        });
      }

      const checkOutWindow = getCheckOutWindow();

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
        'check-out'
      );

      if (!locationResult.ok) {
        return res.status(locationResult.status).json(locationResult);
      }

      const { data: existing, error: existingError } = await supabase
        .from('attendance')
        .select(
          'id, check_in, check_out, lunch_out, lunch_in, lunch_expected_return'
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
      error: err instanceof Error ? err.message : 'Internal server error.',
    });
  }
}