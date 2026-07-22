import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Utensils,
  Pencil,
  X,
  Save,
  Filter,
  AlertTriangle,
  Timer,
  ListChecks,
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
  closed: 'default',
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

const STATUS_OPTIONS = ['present', 'late', 'absent', 'remote', 'closed'];
const LUNCH_STATUS_OPTIONS = [
  'not_taken',
  'out',
  'returned',
  'late_return',
  'missing_lunch_in',
];

type ReportTab = 'history' | 'missing' | 'lunch' | 'ot';

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDatesBetween(start: string, end: string) {
  if (!start || !end) return [];

  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);

  if (Number.isNaN(current.getTime()) || Number.isNaN(last.getTime())) {
    return [];
  }

  while (current <= last) {
    dates.push(formatLocalDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function getMinutesFromDate(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function getCheckInWindow(date = new Date()) {
  const now = getMinutesFromDate(date);

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

function getCheckOutWindow(date = new Date()) {
  const now = getMinutesFromDate(date);

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

function getLunchOutWindow(date = new Date()) {
  const now = getMinutesFromDate(date);
  const start = 12 * 60;
  const end = 13 * 60;

  if (now < start) {
    return {
      allowed: false,
      label: 'Lunch Out opens at 12:00',
    };
  }

  if (now <= end) {
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

function getLunchInWindow(date = new Date()) {
  const now = getMinutesFromDate(date);
  const start = 13 * 60;

  if (now < start) {
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

interface AttRec {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;

  check_in_type?: string | null;
  check_out_type?: string | null;
  overtime_hours?: number | null;
  is_late?: boolean | null;

  lunch_out?: string | null;
  lunch_in?: string | null;
  lunch_expected_return?: string | null;
  lunch_break_minutes?: number | null;
  lunch_late_minutes?: number | null;
  lunch_status?: string | null;

  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  check_in_accuracy?: number | null;
  check_in_site?: string | null;
  check_in_distance_meters?: number | null;
  check_in_verified?: boolean | null;

  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_accuracy?: number | null;
  check_out_site?: string | null;
  check_out_distance_meters?: number | null;
  check_out_verified?: boolean | null;

  lunch_out_site?: string | null;
  lunch_out_distance_meters?: number | null;
  lunch_out_verified?: boolean | null;

  lunch_in_site?: string | null;
  lunch_in_distance_meters?: number | null;
  lunch_in_verified?: boolean | null;
}

interface Emp {
  id: number;
  name: string;
  department: string | null;
  status?: string | null;
}

interface CorrectionForm {
  date: string;
  check_in: string;
  lunch_out: string;
  lunch_in: string;
  lunch_expected_return: string;
  check_out: string;
  status: string;
  overtime_hours: string;
  lunch_break_minutes: string;
  lunch_late_minutes: string;
  lunch_status: string;
  reason: string;
}

interface MissingReportRow {
  employee: Emp;
  date: string;
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

function formatType(value?: string | null) {
  if (!value) return '—';

  return value.replace('_', ' ');
}

function formatTime(value?: string | null) {
  if (!value) return '—';

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function correctionFormFromRecord(record: AttRec): CorrectionForm {
  return {
    date: record.date ?? '',
    check_in: toDateTimeLocal(record.check_in),
    lunch_out: toDateTimeLocal(record.lunch_out),
    lunch_in: toDateTimeLocal(record.lunch_in),
    lunch_expected_return: toDateTimeLocal(record.lunch_expected_return),
    check_out: toDateTimeLocal(record.check_out),
    status: record.status ?? 'present',
    overtime_hours: String(record.overtime_hours ?? 0),
    lunch_break_minutes: String(record.lunch_break_minutes ?? 0),
    lunch_late_minutes: String(record.lunch_late_minutes ?? 0),
    lunch_status: record.lunch_status ?? 'not_taken',
    reason: '',
  };
}

function recordToCsv(record: AttRec, empMap: Record<number, Emp>) {
  return {
    ID: record.id,
    Employee_ID: record.employee_id,
    Employee_Name: empMap[record.employee_id]?.name ?? `#${record.employee_id}`,
    Department: empMap[record.employee_id]?.department ?? '',
    Date: record.date,
    Check_In: record.check_in ? new Date(record.check_in).toLocaleString() : '',
    Check_Out: record.check_out
      ? new Date(record.check_out).toLocaleString()
      : '',
    Status: record.status,
    Check_In_Type: record.check_in_type ?? '',
    Is_Late: record.is_late ? 'Yes' : 'No',
    Check_Out_Type: record.check_out_type ?? '',
    Overtime_Hours: record.overtime_hours ?? 0,
    Lunch_Out: record.lunch_out
      ? new Date(record.lunch_out).toLocaleString()
      : '',
    Lunch_In: record.lunch_in ? new Date(record.lunch_in).toLocaleString() : '',
    Lunch_Expected_Return: record.lunch_expected_return
      ? new Date(record.lunch_expected_return).toLocaleString()
      : '',
    Lunch_Break_Minutes: record.lunch_break_minutes ?? 0,
    Lunch_Late_Minutes: record.lunch_late_minutes ?? 0,
    Lunch_Status: record.lunch_status ?? '',
    Check_In_Site: record.check_in_site ?? '',
    Check_In_Verified: record.check_in_verified ? 'Yes' : 'No',
    Check_Out_Site: record.check_out_site ?? '',
    Check_Out_Verified: record.check_out_verified ? 'Yes' : 'No',
    Lunch_Out_Site: record.lunch_out_site ?? '',
    Lunch_Out_Verified: record.lunch_out_verified ? 'Yes' : 'No',
    Lunch_In_Site: record.lunch_in_site ?? '',
    Lunch_In_Verified: record.lunch_in_verified ? 'Yes' : 'No',
  };
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

  const [now, setNow] = useState(() => new Date());
  const [records, setRecords] = useState<AttRec[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lunchStatusFilter, setLunchStatusFilter] = useState('all');
  const [otOnly, setOtOnly] = useState(false);
  const [missingLunchInOnly, setMissingLunchInOnly] = useState(false);
  const [reportTab, setReportTab] = useState<ReportTab>('history');

  const [editingRecord, setEditingRecord] = useState<AttRec | null>(null);
  const [correctionForm, setCorrectionForm] = useState<CorrectionForm | null>(
    null
  );
  const [correctionError, setCorrectionError] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);

  const checkInWindow = useMemo(() => getCheckInWindow(now), [now]);
  const checkOutWindow = useMemo(() => getCheckOutWindow(now), [now]);
  const lunchOutWindow = useMemo(() => getLunchOutWindow(now), [now]);
  const lunchInWindow = useMemo(() => getLunchInWindow(now), [now]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

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

    employees.forEach((employee) => {
      m[employee.id] = employee;
    });

    return m;
  }, [employees]);

  const visibleEmployees = useMemo(() => {
    if (isAdmin) return employees;

    if (isManagerOnly) {
      return employees.filter(
        (employee) =>
          String(employee.department ?? '').trim().toLowerCase() ===
          profileDepartment
      );
    }

    return employees.filter((employee) => employee.id === profile?.id);
  }, [employees, isAdmin, isManagerOnly, profile?.id, profileDepartment]);

  const activeVisibleEmployees = useMemo(
    () =>
      visibleEmployees.filter(
        (employee) => String(employee.status ?? 'active') !== 'inactive'
      ),
    [visibleEmployees]
  );

  const visibleEmployeeIds = useMemo(
    () => new Set(visibleEmployees.map((employee) => employee.id)),
    [visibleEmployees]
  );

  const roleVisibleRecords = useMemo(() => {
    if (isAdmin) return records;

    return records.filter((record) =>
      visibleEmployeeIds.has(record.employee_id)
    );
  }, [records, visibleEmployeeIds, isAdmin]);

  const filteredRecords = useMemo(() => {
    return roleVisibleRecords.filter((record) => {
      if (dateFrom && record.date < dateFrom) return false;
      if (dateTo && record.date > dateTo) return false;

      if (
        employeeFilter !== 'all' &&
        Number(record.employee_id) !== Number(employeeFilter)
      ) {
        return false;
      }

      if (statusFilter !== 'all' && record.status !== statusFilter) {
        return false;
      }

      if (
        lunchStatusFilter !== 'all' &&
        (record.lunch_status ?? 'not_taken') !== lunchStatusFilter
      ) {
        return false;
      }

      if (otOnly && Number(record.overtime_hours ?? 0) <= 0) {
        return false;
      }

      if (missingLunchInOnly && !(record.lunch_out && !record.lunch_in)) {
        return false;
      }

      return true;
    });
  }, [
    roleVisibleRecords,
    dateFrom,
    dateTo,
    employeeFilter,
    statusFilter,
    lunchStatusFilter,
    otOnly,
    missingLunchInOnly,
  ]);

  const reportStartDate = dateFrom || formatLocalDate();
  const reportEndDate = dateTo || dateFrom || formatLocalDate();

  const missingCheckInReport = useMemo<MissingReportRow[]>(() => {
    if (!isAdminOrManager) return [];

    const dates = getDatesBetween(reportStartDate, reportEndDate);

    const rows: MissingReportRow[] = [];

    for (const date of dates) {
      for (const employee of activeVisibleEmployees) {
        if (
          employeeFilter !== 'all' &&
          Number(employee.id) !== Number(employeeFilter)
        ) {
          continue;
        }

        const hasRecord = records.some(
          (record) => record.employee_id === employee.id && record.date === date
        );

        if (!hasRecord) {
          rows.push({
            employee,
            date,
          });
        }
      }
    }

    return rows;
  }, [
    isAdminOrManager,
    reportStartDate,
    reportEndDate,
    activeVisibleEmployees,
    employeeFilter,
    records,
  ]);

  const lunchReport = useMemo(() => {
    return filteredRecords.filter(
      (record) =>
        record.lunch_out ||
        record.lunch_in ||
        Number(record.lunch_late_minutes ?? 0) > 0 ||
        record.lunch_status === 'missing_lunch_in'
    );
  }, [filteredRecords]);

  const otReport = useMemo(() => {
    return filteredRecords.filter(
      (record) => Number(record.overtime_hours ?? 0) > 0
    );
  }, [filteredRecords]);

  const myToday = useMemo(
    () =>
      (profile &&
        records.find(
          (record) =>
            record.employee_id === profile.id &&
            record.date === formatLocalDate()
        )) ||
      null,
    [records, profile]
  );

  const heatmap = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    const currentDate = new Date();

    for (let i = 41; i >= 0; i--) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - i);

      const key = formatLocalDate(d);

      const count = roleVisibleRecords.filter(
        (record) =>
          record.date === key &&
          (record.status === 'present' || record.status === 'remote')
      ).length;

      days.push({ date: key, count });
    }

    return days;
  }, [roleVisibleRecords]);

  const maxCount = Math.max(...heatmap.map((d) => d.count), 1);

  const currentReportRows =
    reportTab === 'history'
      ? filteredRecords
      : reportTab === 'lunch'
        ? lunchReport
        : reportTab === 'ot'
          ? otReport
          : [];

  const recent = currentReportRows.slice(0, 50);

  const getVerifiedLocation = async (label: string) => {
    setGpsMessage(`Getting your GPS location for ${label}…`);

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
        `You are outside the approved ${label} area.\n\nNearest site: ${
          site.name
        }\nYour distance: ${Math.round(distance)}m\nAllowed radius: ${
          site.radiusMeters
        }m`
      );
    }

    return {
      latitude,
      longitude,
      accuracy,
      distance,
      site,
    };
  };

  const handleExportCsv = () => {
    if (reportTab === 'missing') {
      const rows = missingCheckInReport.map((row) => ({
        Employee_ID: row.employee.id,
        Employee_Name: row.employee.name,
        Department: row.employee.department ?? '',
        Date: row.date,
        Report: 'Missing Check-In',
      }));

      downloadCsv('missing-check-in-report.csv', rows);
      return;
    }

    const rows = currentReportRows.map((record) => recordToCsv(record, empMap));

    downloadCsv(`attendance-${reportTab}.csv`, rows);
  };

  const checkIn = async () => {
    if (!profile) return;

    if (!checkInWindow.allowed) {
      alert(checkInWindow.label);
      return;
    }

    setBusy(true);

    try {
      const location = await getVerifiedLocation('check-in');

      setGpsMessage(
        `Location verified at ${location.site.name}. Distance: ${Math.round(
          location.distance
        )}m.`
      );

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: profile.id,
          date: formatLocalDate(),
          check_in: new Date().toISOString(),
          check_in_latitude: location.latitude,
          check_in_longitude: location.longitude,
          check_in_accuracy: location.accuracy,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to check in.');
      }

      await fetchAll();

      alert(
        `Check-in successful.\n\nType: ${checkInWindow.label}\nSite: ${
          location.site.name
        }\nDistance: ${Math.round(
          location.distance
        )}m\nGPS accuracy: ${Math.round(location.accuracy)}m`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to verify location.');
    } finally {
      setBusy(false);
      setTimeout(() => setGpsMessage(''), 4000);
    }
  };

  const lunchOut = async () => {
    if (!myToday) return;

    if (!lunchOutWindow.allowed) {
      alert(lunchOutWindow.label);
      return;
    }

    setBusy(true);

    try {
      const location = await getVerifiedLocation('lunch-out');

      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myToday.id,
          action: 'lunch_out',
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to record Lunch Out.');
      }

      await fetchAll();

      alert(
        'Lunch Out recorded.\n\nExpected return is 1 hour from your Lunch Out time.'
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to record Lunch Out.');
    } finally {
      setBusy(false);
      setTimeout(() => setGpsMessage(''), 4000);
    }
  };

  const lunchIn = async () => {
    if (!myToday) return;

    if (!lunchInWindow.allowed) {
      alert(lunchInWindow.label);
      return;
    }

    setBusy(true);

    try {
      const location = await getVerifiedLocation('lunch-in');

      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myToday.id,
          action: 'lunch_in',
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to record Lunch In.');
      }

      await fetchAll();

      const lateMinutes = Number(data?.lunch_late_minutes ?? 0);

      alert(
        lateMinutes > 0
          ? `Lunch In recorded.\n\nLate return: ${lateMinutes} minute(s).`
          : 'Lunch In recorded on time.'
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to record Lunch In.');
    } finally {
      setBusy(false);
      setTimeout(() => setGpsMessage(''), 4000);
    }
  };

  const checkOut = async () => {
    if (!myToday) return;

    if (!checkOutWindow.allowed) {
      alert(checkOutWindow.label);
      return;
    }

    setBusy(true);

    try {
      const location = await getVerifiedLocation('check-out');

      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myToday.id,
          check_out: new Date().toISOString(),
          check_out_latitude: location.latitude,
          check_out_longitude: location.longitude,
          check_out_accuracy: location.accuracy,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to check out.');
      }

      await fetchAll();

      alert(
        `Check-out successful.\n\nType: ${
          checkOutWindow.label
        }\nOT Hours: ${checkOutWindow.overtimeHours}\nSite: ${
          location.site.name
        }\nDistance: ${Math.round(
          location.distance
        )}m\nGPS accuracy: ${Math.round(location.accuracy)}m`
      );
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to verify check-out location.'
      );
    } finally {
      setBusy(false);
      setTimeout(() => setGpsMessage(''), 4000);
    }
  };

  const openCorrection = (record: AttRec) => {
    if (!isAdmin) return;

    setEditingRecord(record);
    setCorrectionForm(correctionFormFromRecord(record));
    setCorrectionError('');
  };

  const saveCorrection = async (event: FormEvent) => {
    event.preventDefault();

    if (!editingRecord || !correctionForm || !profile) return;

    if (!correctionForm.reason.trim()) {
      setCorrectionError('Correction reason is required.');
      return;
    }

    setSavingCorrection(true);
    setCorrectionError('');

    try {
      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRecord.id,
          action: 'manual_correction',
          changed_by: profile.id,
          changed_by_name: profile.name,
          reason: correctionForm.reason,
          date: correctionForm.date,
          status: correctionForm.status,
          check_in: correctionForm.check_in,
          lunch_out: correctionForm.lunch_out,
          lunch_in: correctionForm.lunch_in,
          lunch_expected_return: correctionForm.lunch_expected_return,
          check_out: correctionForm.check_out,
          overtime_hours: correctionForm.overtime_hours,
          lunch_break_minutes: correctionForm.lunch_break_minutes,
          lunch_late_minutes: correctionForm.lunch_late_minutes,
          lunch_status: correctionForm.lunch_status,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save correction.');
      }

      await fetchAll();
      setEditingRecord(null);
      setCorrectionForm(null);
    } catch (err) {
      setCorrectionError(
        err instanceof Error ? err.message : 'Failed to save correction.'
      );
    } finally {
      setSavingCorrection(false);
    }
  };

  if (loading) return <LoadingState label="Loading attendance…" />;

  if (error) return <ErrorState message={error} onRetry={fetchAll} />;

  const reportTabs: Array<{
    id: ReportTab;
    label: string;
    icon: typeof ListChecks;
    count: number;
  }> = [
    {
      id: 'history',
      label: 'History',
      icon: ListChecks,
      count: filteredRecords.length,
    },
    {
      id: 'missing',
      label: 'Missing Check-In',
      icon: AlertTriangle,
      count: missingCheckInReport.length,
    },
    {
      id: 'lunch',
      label: 'Lunch Break',
      icon: Utensils,
      count: lunchReport.length,
    },
    {
      id: 'ot',
      label: 'OT Report',
      icon: Timer,
      count: otReport.length,
    },
  ];

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
              disabled={
                reportTab === 'missing'
                  ? missingCheckInReport.length === 0
                  : currentReportRows.length === 0
              }
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
        className="glass rounded-2xl p-6 mb-6 flex flex-col xl:flex-row items-center justify-between gap-5"
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
                ? `Checked in at ${formatTime(myToday.check_in)}`
                : 'No check-in recorded yet today'}

              {myToday?.check_out
                ? ` · Out at ${formatTime(myToday.check_out)}`
                : ''}
            </p>

            {myToday?.lunch_out && (
              <p className="text-xs text-muted mt-1">
                Lunch Out: {formatTime(myToday.lunch_out)} · Expected:{' '}
                {formatTime(myToday.lunch_expected_return)}
              </p>
            )}

            {myToday?.lunch_in && (
              <p className="text-xs text-muted mt-1">
                Lunch In: {formatTime(myToday.lunch_in)} · Break:{' '}
                {myToday.lunch_break_minutes ?? 0} min · Late:{' '}
                <span
                  className={
                    Number(myToday.lunch_late_minutes ?? 0) > 0
                      ? 'text-rose'
                      : 'text-emerald'
                  }
                >
                  {myToday.lunch_late_minutes ?? 0} min
                </span>
              </p>
            )}

            {myToday?.check_in_type && (
              <p className="text-xs text-muted mt-1">
                Check-in type:{' '}
                <span className={myToday.is_late ? 'text-amber' : 'text-emerald'}>
                  {formatType(myToday.check_in_type)}
                </span>
              </p>
            )}

            {myToday?.check_out_type && (
              <p className="text-xs text-muted mt-1">
                Check-out type:{' '}
                <span className="text-accent">
                  {formatType(myToday.check_out_type)}
                </span>
                {' · '}OT: {Number(myToday.overtime_hours ?? 0)}h
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

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={checkIn}
            disabled={!!myToday?.check_in || busy || !checkInWindow.allowed}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2.5 text-sm font-semibold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {checkInWindow.label}
          </button>

          <button
            type="button"
            onClick={lunchOut}
            disabled={
              !myToday?.check_in ||
              !!myToday?.check_out ||
              !!myToday?.lunch_out ||
              busy ||
              !lunchOutWindow.allowed
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-amber/15 text-amber border border-amber/25 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber/25 transition-all"
          >
            <Utensils size={16} />
            {lunchOutWindow.label}
          </button>

          <button
            type="button"
            onClick={lunchIn}
            disabled={
              !myToday?.check_in ||
              !!myToday?.check_out ||
              !myToday?.lunch_out ||
              !!myToday?.lunch_in ||
              busy ||
              !lunchInWindow.allowed
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-accent/15 text-accent border border-accent/25 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-all"
          >
            <Utensils size={16} />
            {lunchInWindow.label}
          </button>

          <button
            type="button"
            onClick={checkOut}
            disabled={
              !myToday?.check_in ||
              !!myToday?.check_out ||
              busy ||
              !checkOutWindow.allowed
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-all"
          >
            <LogOut size={16} />
            {checkOutWindow.label}
          </button>
        </div>
      </motion.div>

      <div className="glass rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-primary" />
          <h3 className="font-display font-semibold">Filters</h3>
        </div>

        <div
          className={`grid grid-cols-1 gap-3 ${
            isAdminOrManager
              ? 'md:grid-cols-3 xl:grid-cols-7'
              : 'sm:grid-cols-2 max-w-xl'
          }`}
        >
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          />

          {isAdminOrManager && (
            <>
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
              >
                <option value="all">All Employees</option>
                {visibleEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
              >
                <option value="all">All Status</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={lunchStatusFilter}
                onChange={(e) => setLunchStatusFilter(e.target.value)}
                className="bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
              >
                <option value="all">All Lunch</option>
                {LUNCH_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ')}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={otOnly}
                  onChange={(e) => setOtOnly(e.target.checked)}
                />
                OT only
              </label>

              <label className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={missingLunchInOnly}
                  onChange={(e) => setMissingLunchInOnly(e.target.checked)}
                />
                Missing Lunch In
              </label>
            </>
          )}
        </div>
      </div>

      {isAdminOrManager && (
        <div className="flex gap-1 bg-surface border border-white/10 rounded-xl p-1 mb-6 w-fit overflow-x-auto">
          {reportTabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setReportTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  reportTab === tab.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <Icon size={14} />
                {tab.label}
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6 mb-6"
      >
        <h3 className="font-display font-semibold mb-1">Presence Heatmap</h3>

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

      {reportTab === 'missing' && isAdminOrManager ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-display font-semibold">
              Missing Check-In Report
            </h3>

            <span className="text-xs text-muted">
              {reportStartDate} → {reportEndDate}
            </span>
          </div>

          {missingCheckInReport.length === 0 ? (
            <EmptyState label="No missing check-ins found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                    <th className="px-6 py-3 font-medium">Employee</th>
                    <th className="px-6 py-3 font-medium">Department</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Report</th>
                  </tr>
                </thead>

                <tbody>
                  {missingCheckInReport.slice(0, 100).map((row) => (
                    <tr
                      key={`${row.employee.id}-${row.date}`}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all"
                    >
                      <td className="px-6 py-3">{row.employee.name}</td>
                      <td className="px-6 py-3 text-muted">
                        {row.employee.department ?? '—'}
                      </td>
                      <td className="px-6 py-3 text-muted">{row.date}</td>
                      <td className="px-6 py-3">
                        <Badge tone="danger">Missing Check-In</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-display font-semibold">
              {reportTab === 'history'
                ? isAdmin
                  ? 'Recent History'
                  : isManagerOnly
                    ? `${profile?.department ?? 'Department'} Attendance History`
                    : 'Your Attendance History'
                : reportTab === 'lunch'
                  ? 'Lunch Break Report'
                  : 'OT Report'}
            </h3>

            <span className="text-xs text-muted">
              Showing {recent.length} of {currentReportRows.length}
            </span>
          </div>

          {recent.length === 0 ? (
            <EmptyState label="No attendance records found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-xs uppercase tracking-wider border-b border-white/5">
                    <th className="px-6 py-3 font-medium">Employee</th>
                    <th className="px-6 py-3 font-medium">Department</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Check In</th>
                    <th className="px-6 py-3 font-medium">Lunch</th>
                    <th className="px-6 py-3 font-medium">Check Out</th>
                    <th className="px-6 py-3 font-medium">OT</th>
                    <th className="px-6 py-3 font-medium">GPS</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    {isAdmin && <th className="px-6 py-3 font-medium" />}
                  </tr>
                </thead>

                <tbody>
                  {recent.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all"
                    >
                      <td className="px-6 py-3">
                        {empMap[record.employee_id]?.name ??
                          `#${record.employee_id}`}
                      </td>

                      <td className="px-6 py-3 text-muted">
                        {empMap[record.employee_id]?.department ?? '—'}
                      </td>

                      <td className="px-6 py-3 text-muted">{record.date}</td>

                      <td className="px-6 py-3 text-muted font-mono text-xs">
                        {formatTime(record.check_in)}
                      </td>

                      <td className="px-6 py-3 text-muted text-xs">
                        <p>Out: {formatTime(record.lunch_out)}</p>
                        <p>In: {formatTime(record.lunch_in)}</p>
                        <p>
                          Late:{' '}
                          <span
                            className={
                              Number(record.lunch_late_minutes ?? 0) > 0
                                ? 'text-rose'
                                : 'text-muted'
                            }
                          >
                            {record.lunch_late_minutes ?? 0}m
                          </span>
                        </p>
                      </td>

                      <td className="px-6 py-3 text-muted font-mono text-xs">
                        {formatTime(record.check_out)}
                      </td>

                      <td className="px-6 py-3 text-muted">
                        {Number(record.overtime_hours ?? 0)}h
                      </td>

                      <td className="px-6 py-3">
                        <div className="space-y-1">
                          {record.check_in_verified ? (
                            <div className="flex items-center gap-1 text-emerald text-xs">
                              <ShieldCheck size={14} />
                              In {formatMeters(record.check_in_distance_meters)}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted text-xs">
                              <ShieldAlert size={14} />
                              In not verified
                            </div>
                          )}

                          {record.lunch_out_verified && (
                            <div className="flex items-center gap-1 text-emerald text-xs">
                              <ShieldCheck size={14} />
                              Lunch Out{' '}
                              {formatMeters(record.lunch_out_distance_meters)}
                            </div>
                          )}

                          {record.lunch_in_verified && (
                            <div className="flex items-center gap-1 text-emerald text-xs">
                              <ShieldCheck size={14} />
                              Lunch In{' '}
                              {formatMeters(record.lunch_in_distance_meters)}
                            </div>
                          )}

                          {record.check_out_verified ? (
                            <div className="flex items-center gap-1 text-emerald text-xs">
                              <ShieldCheck size={14} />
                              Out {formatMeters(record.check_out_distance_meters)}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted text-xs">
                              <ShieldAlert size={14} />
                              Out not verified
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-3">
                        <Badge tone={STATUS_TONE[record.status] ?? 'default'}>
                          {record.status}
                        </Badge>
                      </td>

                      {isAdmin && (
                        <td className="px-6 py-3">
                          <button
                            type="button"
                            onClick={() => openCorrection(record)}
                            className="text-muted hover:text-primary transition-all"
                            title="Manual correction"
                          >
                            <Pencil size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-muted mt-2 justify-end">
        <Database size={12} />
        Data synced live with Supabase
      </div>

      <AnimatePresence>
        {editingRecord && correctionForm && isAdmin && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => {
                setEditingRecord(null);
                setCorrectionForm(null);
              }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="glass-solid rounded-2xl p-6 w-full max-w-2xl pointer-events-auto max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold">
                    Manual Attendance Correction
                  </h3>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecord(null);
                      setCorrectionForm(null);
                    }}
                    className="text-muted hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={saveCorrection} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Date
                      </label>
                      <input
                        type="date"
                        value={correctionForm.date}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            date: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Status
                      </label>
                      <select
                        value={correctionForm.status}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            status: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Check In
                      </label>
                      <input
                        type="datetime-local"
                        value={correctionForm.check_in}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            check_in: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Check Out
                      </label>
                      <input
                        type="datetime-local"
                        value={correctionForm.check_out}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            check_out: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Lunch Out
                      </label>
                      <input
                        type="datetime-local"
                        value={correctionForm.lunch_out}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            lunch_out: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Expected Return
                      </label>
                      <input
                        type="datetime-local"
                        value={correctionForm.lunch_expected_return}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            lunch_expected_return: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Lunch In
                      </label>
                      <input
                        type="datetime-local"
                        value={correctionForm.lunch_in}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            lunch_in: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        OT Hours
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={correctionForm.overtime_hours}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            overtime_hours: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Lunch Break Minutes
                      </label>
                      <input
                        type="number"
                        value={correctionForm.lunch_break_minutes}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            lunch_break_minutes: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted mb-1 block">
                        Lunch Late Minutes
                      </label>
                      <input
                        type="number"
                        value={correctionForm.lunch_late_minutes}
                        onChange={(e) =>
                          setCorrectionForm({
                            ...correctionForm,
                            lunch_late_minutes: e.target.value,
                          })
                        }
                        className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted mb-1 block">
                      Lunch Status
                    </label>
                    <select
                      value={correctionForm.lunch_status}
                      onChange={(e) =>
                        setCorrectionForm({
                          ...correctionForm,
                          lunch_status: e.target.value,
                        })
                      }
                      className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
                    >
                      {LUNCH_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    required
                    placeholder="Correction reason required"
                    value={correctionForm.reason}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        reason: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full bg-surface border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 resize-none"
                  />

                  {correctionError && (
                    <p className="text-rose text-xs bg-rose/10 border border-rose/20 rounded-lg px-3 py-2">
                      {correctionError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={savingCorrection}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {savingCorrection ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Save size={16} />
                        Save Correction
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}