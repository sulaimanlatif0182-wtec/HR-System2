import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  LogIn,
  LogOut,
  Loader2,
  Database,
  Download,
  MapPin,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/ui';

const STATUS_TONE: Record<string, string> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  remote: 'info',
};

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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface AttRec {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  check_in_accuracy?: number | null;
  check_in_site?: string | null;
  check_in_distance_meters?: number | null;
  check_in_verified?: boolean | null;
}

interface Emp {
  id: number;
  name: string;
  department: string | null;
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return '""';

  const stringValue = String(value).replace(/"/g, '""');

  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const earthRadiusMeters = 6371000;

  const toRadians = (value: number) => (value * Math.PI) / 180;

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

function findNearestSite(latitude: number, longitude: number) {
  const sitesWithDistance = ATTENDANCE_SITES.map((site) => ({
    site,
    distanceMeters: getDistanceMeters(
      latitude,
      longitude,
      site.latitude,
      site.longitude
    ),
  }));

  return sitesWithDistance.sort(
    (a, b) => a.distanceMeters - b.distanceMeters
  )[0];
}

function getBrowserLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS location is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

function formatMeters(value?: number | null) {
  if (value === null || value === undefined) return '—';

  return `${Math.round(Number(value))}m`;
}

export default function Attendance() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isManagerOnly = profile?.role === 'manager';
  const isAdminOrManager =
    profile?.role === 'admin' || profile?.role === 'manager';

  const profileDepartment = String(profile?.department ?? '')
    .trim()
    .toLowerCase();

  const [records, setRecords] = useState<AttRec[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError('');

    try {
      const [att, emp] = await Promise.all([
        fetch('/api/attendance').then((r) => r.json()),
        fetch('/api/employees').then((r) => r.json()),
      ]);

      setRecords(Array.isArray(att) ? att : []);
      setEmployees(Array.isArray(emp) ? emp : []);
    } catch {
      setError('Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const empMap = useMemo(() => {
    const m: Record<number, Emp> = {};

    employees.forEach((e) => {
      m[e.id] = e;
    });

    return m;
  }, [employees]);

  const visibleEmployees = useMemo(() => {
    if (isAdmin) {
      return employees;
    }

    if (isManagerOnly) {
      return employees.filter(
        (employee) =>
          String(employee.department ?? '').trim().toLowerCase() ===
          profileDepartment
      );
    }

    return employees.filter((employee) => employee.id === profile?.id);
  }, [employees, isAdmin, isManagerOnly, profile?.id, profileDepartment]);

  const visibleEmployeeIds = useMemo(
    () => new Set(visibleEmployees.map((employee) => employee.id)),
    [visibleEmployees]
  );

  const visibleRecords = useMemo(() => {
    if (isAdmin) {
      return records;
    }

    return records.filter((record) =>
      visibleEmployeeIds.has(record.employee_id)
    );
  }, [records, visibleEmployeeIds, isAdmin]);

  const myToday = useMemo(
    () =>
      (profile &&
        records.find(
          (r) => r.employee_id === profile.id && r.date === todayStr()
        )) ||
      null,
    [records, profile]
  );

  const heatmap = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    const now = new Date();

    for (let i = 41; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);

      const key = d.toISOString().slice(0, 10);

      const count = visibleRecords.filter(
        (r) =>
          r.date === key && (r.status === 'present' || r.status === 'remote')
      ).length;

      days.push({ date: key, count });
    }

    return days;
  }, [visibleRecords]);

  const maxCount = Math.max(...heatmap.map((d) => d.count), 1);

  const recent = visibleRecords.slice(0, 30);

  const handleExportCsv = () => {
    const rows = visibleRecords.map((r) => ({
      ID: r.id,
      Employee_ID: r.employee_id,
      Employee_Name: empMap[r.employee_id]?.name ?? `#${r.employee_id}`,
      Department: empMap[r.employee_id]?.department ?? '',
      Date: r.date,
      Check_In: r.check_in ? new Date(r.check_in).toLocaleString() : '',
      Check_Out: r.check_out ? new Date(r.check_out).toLocaleString() : '',
      Status: r.status,
      Check_In_Site: r.check_in_site ?? '',
      Check_In_Verified: r.check_in_verified ? 'Yes' : 'No',
      Check_In_Distance_Meters: r.check_in_distance_meters ?? '',
      Check_In_Accuracy_Meters: r.check_in_accuracy ?? '',
      Check_In_Latitude: r.check_in_latitude ?? '',
      Check_In_Longitude: r.check_in_longitude ?? '',
    }));

    downloadCsv('attendance.csv', rows);
  };

  const checkIn = async () => {
    if (!profile) return;

    setBusy(true);
    setGpsMessage('Getting your GPS location…');

    try {
      const position = await getBrowserLocation();

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      if (accuracy > MAX_GPS_ACCURACY_METERS) {
        throw new Error(
          `Your GPS accuracy is too low (${Math.round(
            accuracy
          )}m). Please move near an open area or enable high accuracy GPS, then try again.`
        );
      }

      const nearest = findNearestSite(latitude, longitude);

      if (!nearest) {
        throw new Error('No approved attendance site is configured.');
      }

      const distance = nearest.distanceMeters;
      const site = nearest.site;

      if (distance > site.radiusMeters) {
        throw new Error(
          `You are outside the approved check-in area.\n\nNearest site: ${
            site.name
          }\nYour distance: ${Math.round(
            distance
          )}m\nAllowed radius: ${site.radiusMeters}m`
        );
      }

      setGpsMessage(
        `Location verified at ${site.name}. Distance: ${Math.round(distance)}m.`
      );

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: profile.id,
          date: todayStr(),
          check_in: new Date().toISOString(),
          status: 'present',
          check_in_latitude: latitude,
          check_in_longitude: longitude,
          check_in_accuracy: accuracy,
          check_in_site: site.name,
          check_in_distance_meters: Math.round(distance),
          check_in_verified: true,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to check in.');
      }

      await fetchAll();

      alert(
        `Check-in successful.\n\nSite: ${site.name}\nDistance: ${Math.round(
          distance
        )}m\nGPS accuracy: ${Math.round(accuracy)}m`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to verify location.');
    } finally {
      setBusy(false);
      setTimeout(() => setGpsMessage(''), 4000);
    }
  };

  const checkOut = async () => {
    if (!myToday) return;

    setBusy(true);

    try {
      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myToday.id,
          check_out: new Date().toISOString(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to check out.');
      }

      await fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to check out.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading attendance…" />;

  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={
          isAdmin
            ? 'Track daily check-ins and monitor org-wide presence.'
            : isManagerOnly
              ? `Track attendance for ${profile?.department ?? 'your department'}.`
              : 'GPS verified check-in for your daily attendance.'
        }
        action={
          isAdminOrManager ? (
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={visibleRecords.length === 0}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <Download size={16} />
              Export CSV
            </button>
          ) : undefined
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center justify-between gap-5"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/30">
            <Clock size={24} className="text-white" />
          </div>

          <div>
            <p className="font-display font-semibold text-lg">
              {myToday?.check_out
                ? "You're all done for today"
                : myToday?.check_in
                  ? "You're checked in"
                  : 'Ready to start your day?'}
            </p>

            <p className="text-xs text-muted mt-0.5">
              {myToday?.check_in
                ? `Checked in at ${new Date(myToday.check_in).toLocaleTimeString(
                    [],
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  )}`
                : 'No check-in recorded yet today'}

              {myToday?.check_out
                ? ` · Out at ${new Date(myToday.check_out).toLocaleTimeString(
                    [],
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  )}`
                : ''}
            </p>

            {myToday?.check_in_verified && (
              <p className="text-xs text-emerald mt-1 flex items-center gap-1">
                <ShieldCheck size={13} />
                Verified at {myToday.check_in_site ?? 'approved site'} ·{' '}
                {formatMeters(myToday.check_in_distance_meters)}
              </p>
            )}

            {gpsMessage && (
              <p className="text-xs text-accent mt-1 flex items-center gap-1">
                <MapPin size={13} />
                {gpsMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={checkIn}
            disabled={!!myToday?.check_in || busy}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2.5 text-sm font-semibold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <LogIn size={16} />
            )}
            GPS Check In
          </button>

          <button
            type="button"
            onClick={checkOut}
            disabled={!myToday?.check_in || !!myToday?.check_out || busy}
            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-all"
          >
            <LogOut size={16} />
            Check Out
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6 mb-6"
      >
        <h3 className="font-display font-semibold mb-1">
          Presence Heatmap
        </h3>

        <p className="text-xs text-muted mb-4">
          Last 42 days ·{' '}
          {isAdmin
            ? 'org-wide presence intensity'
            : isManagerOnly
              ? `${profile?.department ?? 'department'} presence intensity`
              : 'your attendance intensity'}
        </p>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 max-w-md">
          {heatmap.map((d) => {
            const intensity = d.count / maxCount;

            return (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} present`}
                className="aspect-square rounded-md"
                style={{
                  background:
                    intensity === 0
                      ? 'rgba(255,255,255,0.04)'
                      : `rgba(139, 92, 246, ${0.15 + intensity * 0.75})`,
                }}
              />
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="font-display font-semibold">
            {isAdmin
              ? 'Recent History'
              : isManagerOnly
                ? `${profile?.department ?? 'Department'} Attendance History`
                : 'Your Attendance History'}
          </h3>
        </div>

        {recent.length === 0 ? (
          <EmptyState label="No attendance records yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Department</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Check In</th>
                  <th className="px-6 py-3 font-medium">Check Out</th>
                  <th className="px-6 py-3 font-medium">Site</th>
                  <th className="px-6 py-3 font-medium">GPS</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>

              <tbody>
                {recent.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all"
                  >
                    <td className="px-6 py-3">
                      {empMap[r.employee_id]?.name ?? `#${r.employee_id}`}
                    </td>

                    <td className="px-6 py-3 text-muted">
                      {empMap[r.employee_id]?.department ?? '—'}
                    </td>

                    <td className="px-6 py-3 text-muted">{r.date}</td>

                    <td className="px-6 py-3 text-muted font-mono text-xs">
                      {r.check_in
                        ? new Date(r.check_in).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>

                    <td className="px-6 py-3 text-muted font-mono text-xs">
                      {r.check_out
                        ? new Date(r.check_out).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>

                    <td className="px-6 py-3 text-muted">
                      {r.check_in_site ?? '—'}
                    </td>

                    <td className="px-6 py-3">
                      {r.check_in_verified ? (
                        <div className="flex items-center gap-1 text-emerald text-xs">
                          <ShieldCheck size={14} />
                          {formatMeters(r.check_in_distance_meters)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted text-xs">
                          <ShieldAlert size={14} />
                          Not verified
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-3">
                      <Badge tone={STATUS_TONE[r.status] ?? 'default'}>
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <div className="flex items-center gap-1.5 text-xs text-muted mt-2 justify-end">
        <Database size={12} />
        Data synced live with Supabase
      </div>
    </div>
  );
}