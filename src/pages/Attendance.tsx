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
  Smartphone,
  RefreshCw,
  Fingerprint,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
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

const DEVICE_STATUS_TONE: Record<string, string> = {
  approved: 'success',
  pending: 'warning',
  revoked: 'danger',
};

const GEOFENCE_RADIUS_METERS = 100;
const MAX_GPS_ACCURACY_METERS = 250;
const ATTENDANCE_TEST_MODE = false;

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
  check_in_device_id?: number | null;
  check_in_webauthn_verified?: boolean | null;

  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_accuracy?: number | null;
  check_out_site?: string | null;
  check_out_distance_meters?: number | null;
  check_out_verified?: boolean | null;
  check_out_device_id?: number | null;
  check_out_webauthn_verified?: boolean | null;

  lunch_out_latitude?: number | null;
  lunch_out_longitude?: number | null;
  lunch_out_accuracy?: number | null;
  lunch_out_site?: string | null;
  lunch_out_distance_meters?: number | null;
  lunch_out_verified?: boolean | null;
  lunch_out_device_id?: number | null;
  lunch_out_webauthn_verified?: boolean | null;

  lunch_in_latitude?: number | null;
  lunch_in_longitude?: number | null;
  lunch_in_accuracy?: number | null;
  lunch_in_site?: string | null;
  lunch_in_distance_meters?: number | null;
  lunch_in_verified?: boolean | null;
  lunch_in_device_id?: number | null;
  lunch_in_webauthn_verified?: boolean | null;
}

interface Emp {
  id: number;
  name: string;
  department: string | null;
  status?: string | null;
}

interface EmployeeDevice {
  id: number;
  employee_id: number;
  credential_id: string;
  public_key?: string;
  counter?: number;
  device_name: string | null;
  user_agent: string | null;
  status: string;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  revoked_at?: string | null;
  created_at?: string | null;
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

function isSaturday(date = new Date()) {
  return date.getDay() === 6;
}

function getCheckInWindow(date = new Date()) {
  if (ATTENDANCE_TEST_MODE) {
    return {
      allowed: true,
      type: 'test',
      status: 'present',
      label: 'Test Check In',
      isLate: false,
    };
  }

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

  if (isSaturday(date)) {
    const saturdayStart = 12 * 60;
    const saturdayEnd = 20 * 60;

    if (now < saturdayStart) {
      return {
        allowed: false,
        type: 'not_open',
        label: 'Saturday check-out opens at 12:00',
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
      label: 'Saturday check-out window closed at 20:00',
      overtimeHours: 0,
    };
  }

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
  const end = 14 * 60 + 30;

  if (now < start) {
    return {
      allowed: false,
      label: 'Lunch In opens at 13:00',
    };
  }

  if (now <= end) {
    return {
      allowed: true,
      label: 'Lunch In',
    };
  }

  return {
    allowed: false,
    label: 'Lunch In window closed at 14:30',
  };
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

  return value.replace(/_/g, ' ');
}

function formatTime(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
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
    Check_In_Distance_Meters: record.check_in_distance_meters ?? '',
    Check_In_GPS_Verified: record.check_in_verified ? 'Yes' : 'No',
    Check_In_Device_ID: record.check_in_device_id ?? '',
    Check_In_WebAuthn_Verified: record.check_in_webauthn_verified ? 'Yes' : 'No',
    Lunch_Out_Site: record.lunch_out_site ?? '',
    Lunch_Out_Distance_Meters: record.lunch_out_distance_meters ?? '',
    Lunch_Out_GPS_Verified: record.lunch_out_verified ? 'Yes' : 'No',
    Lunch_Out_Device_ID: record.lunch_out_device_id ?? '',
    Lunch_Out_WebAuthn_Verified: record.lunch_out_webauthn_verified
      ? 'Yes'
      : 'No',
    Lunch_In_Site: record.lunch_in_site ?? '',
    Lunch_In_Distance_Meters: record.lunch_in_distance_meters ?? '',
    Lunch_In_GPS_Verified: record.lunch_in_verified ? 'Yes' : 'No',
    Lunch_In_Device_ID: record.lunch_in_device_id ?? '',
    Lunch_In_WebAuthn_Verified: record.lunch_in_webauthn_verified
      ? 'Yes'
      : 'No',
    Check_Out_Site: record.check_out_site ?? '',
    Check_Out_Distance_Meters: record.check_out_distance_meters ?? '',
    Check_Out_GPS_Verified: record.check_out_verified ? 'Yes' : 'No',
    Check_Out_Device_ID: record.check_out_device_id ?? '',
    Check_Out_WebAuthn_Verified: record.check_out_webauthn_verified
      ? 'Yes'
      : 'No',
  };
}

function VerificationStatus({ gps, passkey }: { gps?: boolean | null; passkey?: boolean | null }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          gps ? 'bg-emerald/15 text-emerald' : 'bg-white/10 text-muted'
        }`}
      >
        {gps ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
        GPS
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          passkey ? 'bg-primary/15 text-primary' : 'bg-white/10 text-muted'
        }`}
      >
        {passkey ? <Fingerprint size={11} /> : <ShieldAlert size={11} />}
        Passkey
      </span>
    </div>
  );
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
  const [devices, setDevices] = useState<EmployeeDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [deviceMessage, setDeviceMessage] = useState('');

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

  const approvedDevices = useMemo(
    () =>
      devices.filter(
        (device) => device.status === 'approved' && !device.revoked_at
      ),
    [devices]
  );

  const pendingDevices = useMemo(
    () => devices.filter((device) => device.status === 'pending'),
    [devices]
  );

  const hasApprovedDevice = approvedDevices.length > 0;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    if (!profile?.id) return;

    setDeviceLoading(true);

    try {
      const data = await fetch(`/api/device-auth?employee_id=${profile.id}`).then(
        (r) => r.json()
      );

      setDevices(Array.isArray(data) ? data : []);
    } catch {
      setDevices([]);
    } finally {
      setDeviceLoading(false);
    }
  };

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

  useEffect(() => {
    fetchDevices();
  }, [profile?.id]);

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

  const todayPresentCount = roleVisibleRecords.filter(
    (record) =>
      record.date === formatLocalDate() &&
      (record.status === 'present' || record.status === 'late' || record.status === 'remote')
  ).length;

  const todayLateCount = roleVisibleRecords.filter(
    (record) => record.date === formatLocalDate() && record.status === 'late'
  ).length;

  const currentReportRows =
    reportTab === 'history'
      ? filteredRecords
      : reportTab === 'lunch'
        ? lunchReport
        : reportTab === 'ot'
          ? otReport
          : [];

  const recent = currentReportRows.slice(0, 50);

  const registerDevice = async () => {
    if (!profile?.id) return;

    setDeviceLoading(true);
    setDeviceMessage('');

    try {
      const deviceName =
        window.prompt(
          'Name this attendance device:',
          `${navigator.platform || 'Device'} - ${
            navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Browser'
          }`
        ) || 'Attendance Device';

      const optionsRes = await fetch('/api/device-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'registration_options',
          employee_id: profile.id,
        }),
      });

      const options = await optionsRes.json();

      if (!optionsRes.ok) {
        throw new Error(options?.error || 'Failed to start device registration.');
      }

      const registrationResponse = await startRegistration(options as any);

      const verifyRes = await fetch('/api/device-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'registration_verify',
          employee_id: profile.id,
          response: registrationResponse,
          device_name: deviceName,
          user_agent: navigator.userAgent,
        }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData?.error || 'Device registration failed.');
      }

      setDeviceMessage(
        'Device registered. Please wait for admin approval before using attendance.'
      );

      await fetchDevices();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to register attendance device.'
      );
    } finally {
      setDeviceLoading(false);
    }
  };

  const verifyDeviceForAttendance = async (purpose: string) => {
    if (!profile?.id) {
      throw new Error('Profile not loaded.');
    }

    setGpsMessage('GPS verified. Please complete device/passkey verification…');

    const optionsRes = await fetch('/api/device-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'authentication_options',
        employee_id: profile.id,
      }),
    });

    const authOptions = await optionsRes.json();

    if (!optionsRes.ok) {
      throw new Error(
        authOptions?.error ||
          'No approved attendance device found. Please register this device.'
      );
    }

    const authenticationResponse = await startAuthentication(authOptions as any);

    const verifyRes = await fetch('/api/device-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'authentication_verify',
        employee_id: profile.id,
        response: authenticationResponse,
        purpose,
      }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      throw new Error(verifyData?.error || 'Device verification failed.');
    }

    return {
      token: verifyData.token as string,
      deviceId: verifyData.device_id as number,
    };
  };

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

  const ensureApprovedDevice = () => {
    if (hasApprovedDevice) return true;

    alert(
      'No approved attendance device found. Please register this device and wait for admin approval.'
    );

    return false;
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

    if (!ensureApprovedDevice()) return;

    setBusy(true);

    try {
      const location = await getVerifiedLocation('check-in');

      setGpsMessage(
        `Location verified at ${location.site.name}. Distance: ${Math.round(
          location.distance
        )}m. Waiting for passkey…`
      );

      const deviceAuth = await verifyDeviceForAttendance('attendance_check_in');

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
          device_auth_token: deviceAuth.token,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to check in.');
      }

      await fetchAll();

      alert(
        `Check-in successful.\n\nDevice/passkey verified.\nType: ${
          checkInWindow.label
        }\nSite: ${location.site.name}\nDistance: ${Math.round(
          location.distance
        )}m\nGPS accuracy: ${Math.round(location.accuracy)}m`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to verify check-in.');
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

    if (!ensureApprovedDevice()) return;

    setBusy(true);

    try {
      const location = await getVerifiedLocation('lunch-out');

      setGpsMessage(
        `Location verified at ${location.site.name}. Distance: ${Math.round(
          location.distance
        )}m. Waiting for passkey…`
      );

      const deviceAuth = await verifyDeviceForAttendance('attendance_lunch_out');

      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myToday.id,
          action: 'lunch_out',
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          device_auth_token: deviceAuth.token,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to record Lunch Out.');
      }

      await fetchAll();

      alert(
        `Lunch Out recorded.\n\nDevice/passkey verified.\nSite: ${
          location.site.name
        }\nDistance: ${Math.round(
          location.distance
        )}m\nExpected return is 1 hour from your Lunch Out time.`
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

    if (!ensureApprovedDevice()) return;

    setBusy(true);

    try {
      const location = await getVerifiedLocation('lunch-in');

      setGpsMessage(
        `Location verified at ${location.site.name}. Distance: ${Math.round(
          location.distance
        )}m. Waiting for passkey…`
      );

      const deviceAuth = await verifyDeviceForAttendance('attendance_lunch_in');

      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myToday.id,
          action: 'lunch_in',
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          device_auth_token: deviceAuth.token,
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
          ? `Lunch In recorded.\n\nDevice/passkey verified.\nLate return: ${lateMinutes} minute(s).`
          : 'Lunch In recorded on time.\n\nDevice/passkey verified.'
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

    if (!ensureApprovedDevice()) return;

    setBusy(true);

    try {
      const location = await getVerifiedLocation('check-out');

      setGpsMessage(
        `Location verified at ${location.site.name}. Distance: ${Math.round(
          location.distance
        )}m. Waiting for passkey…`
      );

      const deviceAuth = await verifyDeviceForAttendance('attendance_check_out');

      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myToday.id,
          check_out: new Date().toISOString(),
          check_out_latitude: location.latitude,
          check_out_longitude: location.longitude,
          check_out_accuracy: location.accuracy,
          device_auth_token: deviceAuth.token,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to check out.');
      }

      await fetchAll();

      alert(
        `Check-out successful.\n\nDevice/passkey verified.\nType: ${
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
    icon: LucideIcon;
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
              : 'GPS + device/passkey verified attendance.'
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <Database size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Visible Records</p>
            <p className="font-display font-semibold text-xl">
              {roleVisibleRecords.length}
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald/15 text-emerald grid place-items-center">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Today Present</p>
            <p className="font-display font-semibold text-xl">
              {todayPresentCount}
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber/15 text-amber grid place-items-center">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-xs text-muted">Today Late</p>
            <p className="font-display font-semibold text-xl">
              {todayLateCount}
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <Smartphone size={20} />
          </div>

          <div>
            <p className="font-display font-semibold text-sm">
              Attendance Device
            </p>

            {deviceLoading ? (
              <p className="text-xs text-muted mt-1">Checking device status…</p>
            ) : hasApprovedDevice ? (
              <p className="text-xs text-emerald mt-1">
                Approved device ready for check-in, lunch out, lunch in and check-out.
              </p>
            ) : pendingDevices.length > 0 ? (
              <p className="text-xs text-amber mt-1">
                Device registered. Waiting for admin approval.
              </p>
            ) : (
              <p className="text-xs text-muted mt-1">
                Register this phone/browser before using attendance.
              </p>
            )}

            {deviceMessage && (
              <p className="text-xs text-accent mt-1">{deviceMessage}</p>
            )}

            {devices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {devices.slice(0, 3).map((device) => (
                  <Badge
                    key={device.id}
                    tone={DEVICE_STATUS_TONE[device.status] ?? 'default'}
                  >
                    {device.device_name || 'Device'} · {device.status}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchDevices}
            disabled={deviceLoading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            type="button"
            onClick={registerDevice}
            disabled={deviceLoading}
            className="flex items-center gap-2 rounded-xl bg-primary/15 text-primary border border-primary/25 px-4 py-2.5 text-sm font-semibold hover:bg-primary/25 disabled:opacity-50 transition-all"
          >
            {deviceLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Fingerprint size={16} />
            )}
            Register Device
          </button>
        </div>
      </div>

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

            {(myToday?.check_in_webauthn_verified ||
              myToday?.lunch_out_webauthn_verified ||
              myToday?.lunch_in_webauthn_verified ||
              myToday?.check_out_webauthn_verified) && (
              <p className="text-xs text-emerald mt-1 flex items-center gap-1">
                <ShieldCheck size={13} />
                Device/passkey verification recorded today
              </p>
            )}

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
            disabled={
              !!myToday?.check_in ||
              busy ||
              !checkInWindow.allowed ||
              !hasApprovedDevice
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2.5 text-sm font-semibold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {!hasApprovedDevice ? 'Device Approval Required' : checkInWindow.label}
          </button>

          <button
            type="button"
            onClick={lunchOut}
            disabled={
              !myToday?.check_in ||
              !!myToday?.check_out ||
              !!myToday?.lunch_out ||
              busy ||
              !lunchOutWindow.allowed ||
              !hasApprovedDevice
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-amber/15 text-amber border border-amber/25 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber/25 transition-all"
          >
            <Utensils size={16} />
            {!hasApprovedDevice ? 'Device Approval Required' : lunchOutWindow.label}
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
              !lunchInWindow.allowed ||
              !hasApprovedDevice
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-accent/15 text-accent border border-accent/25 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-all"
          >
            <Utensils size={16} />
            {!hasApprovedDevice ? 'Device Approval Required' : lunchInWindow.label}
          </button>

          <button
            type="button"
            onClick={checkOut}
            disabled={
              !myToday?.check_in ||
              !!myToday?.check_out ||
              busy ||
              !checkOutWindow.allowed ||
              !hasApprovedDevice
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-all"
          >
            <LogOut size={16} />
            {!hasApprovedDevice ? 'Device Approval Required' : checkOutWindow.label}
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
                    {status.replace(/_/g, ' ')}
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

      <div className="glass rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="font-display font-semibold text-sm">42-Day Presence Heatmap</p>
            <p className="text-xs text-muted">
              Darker color means more visible employees present on that day.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-14 sm:grid-cols-21 md:grid-cols-42 gap-1">
          {heatmap.map((day) => {
            const opacity = Math.max(0.12, day.count / maxCount);

            return (
              <div
                key={day.date}
                title={`${day.date}: ${day.count}`}
                className="h-4 rounded bg-primary"
                style={{ opacity }}
              />
            );
          })}
        </div>
      </div>

      <div className="glass rounded-2xl p-6 overflow-x-auto">
        {reportTab === 'missing' ? (
          missingCheckInReport.length === 0 ? (
            <EmptyState label="No missing check-in records found for the selected date range." />
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-white/10">
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Employee</th>
                  <th className="py-3 pr-4">Department</th>
                  <th className="py-3 pr-4">Report</th>
                </tr>
              </thead>
              <tbody>
                {missingCheckInReport.map((row) => (
                  <tr
                    key={`${row.employee.id}-${row.date}`}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="py-3 pr-4 whitespace-nowrap">{row.date}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {row.employee.name}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {row.employee.department ?? '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone="danger">Missing Check-In</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : recent.length === 0 ? (
          <EmptyState label="No attendance records found for the selected filters." />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-white/10">
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Employee</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Check In</th>
                <th className="py-3 pr-4">Lunch</th>
                <th className="py-3 pr-4">Check Out</th>
                <th className="py-3 pr-4">OT</th>
                <th className="py-3 pr-4">Verification</th>
                {isAdmin && <th className="py-3 pr-4">Action</th>}
              </tr>
            </thead>
            <tbody>
              {recent.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-white/5 last:border-0 align-top"
                >
                  <td className="py-3 pr-4 whitespace-nowrap">{record.date}</td>
                  <td className="py-3 pr-4 min-w-[170px]">
                    <p className="font-medium">
                      {empMap[record.employee_id]?.name ?? `#${record.employee_id}`}
                    </p>
                    <p className="text-xs text-muted">
                      {empMap[record.employee_id]?.department ?? '—'}
                    </p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Badge tone={STATUS_TONE[record.status] ?? 'default'}>
                      {record.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 min-w-[150px]">
                    <p>{formatTime(record.check_in)}</p>
                    <p className="text-xs text-muted">
                      {formatType(record.check_in_type)} · {record.check_in_site ?? '—'}
                    </p>
                    <p className="text-xs text-muted">
                      {formatMeters(record.check_in_distance_meters)} · Accuracy{' '}
                      {formatMeters(record.check_in_accuracy)}
                    </p>
                  </td>
                  <td className="py-3 pr-4 min-w-[190px]">
                    <p className="text-xs text-muted">
                      Out: <span className="text-ink">{formatTime(record.lunch_out)}</span>
                    </p>
                    <p className="text-xs text-muted">
                      Expected:{' '}
                      <span className="text-ink">
                        {formatTime(record.lunch_expected_return)}
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      In: <span className="text-ink">{formatTime(record.lunch_in)}</span>
                    </p>
                    <p className="text-xs text-muted">
                      Break {record.lunch_break_minutes ?? 0}m · Late{' '}
                      <span
                        className={
                          Number(record.lunch_late_minutes ?? 0) > 0
                            ? 'text-rose'
                            : 'text-emerald'
                        }
                      >
                        {record.lunch_late_minutes ?? 0}m
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      Status: {formatType(record.lunch_status)}
                    </p>
                  </td>
                  <td className="py-3 pr-4 min-w-[150px]">
                    <p>{formatTime(record.check_out)}</p>
                    <p className="text-xs text-muted">
                      {formatType(record.check_out_type)} · {record.check_out_site ?? '—'}
                    </p>
                    <p className="text-xs text-muted">
                      {formatMeters(record.check_out_distance_meters)} · Accuracy{' '}
                      {formatMeters(record.check_out_accuracy)}
                    </p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {Number(record.overtime_hours ?? 0)}h
                  </td>
                  <td className="py-3 pr-4 min-w-[170px] space-y-2">
                    <div>
                      <p className="text-[10px] text-muted mb-1">Check In</p>
                      <VerificationStatus
                        gps={record.check_in_verified}
                        passkey={record.check_in_webauthn_verified}
                      />
                    </div>
                    {(record.lunch_out || record.lunch_in) && (
                      <div>
                        <p className="text-[10px] text-muted mb-1">Lunch</p>
                        <VerificationStatus
                          gps={record.lunch_out_verified || record.lunch_in_verified}
                          passkey={
                            record.lunch_out_webauthn_verified ||
                            record.lunch_in_webauthn_verified
                          }
                        />
                      </div>
                    )}
                    {record.check_out && (
                      <div>
                        <p className="text-[10px] text-muted mb-1">Check Out</p>
                        <VerificationStatus
                          gps={record.check_out_verified}
                          passkey={record.check_out_webauthn_verified}
                        />
                      </div>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openCorrection(record)}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 transition-all"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {reportTab !== 'missing' && currentReportRows.length > 50 && (
          <p className="text-xs text-muted mt-4">
            Showing latest 50 rows. Use filters or Export CSV for full report.
          </p>
        )}
      </div>

      <AnimatePresence>
        {editingRecord && correctionForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              onSubmit={saveCorrection}
              className="glass rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h3 className="font-display font-semibold text-lg">
                    Manual Attendance Correction
                  </h3>
                  <p className="text-xs text-muted mt-1">
                    Employee:{' '}
                    {empMap[editingRecord.employee_id]?.name ??
                      `#${editingRecord.employee_id}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingRecord(null);
                    setCorrectionForm(null);
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>

              {correctionError && (
                <div className="mb-4 rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
                  {correctionError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">Date</span>
                  <input
                    type="date"
                    value={correctionForm.date}
                    onChange={(e) =>
                      setCorrectionForm({ ...correctionForm, date: e.target.value })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">Status</span>
                  <select
                    value={correctionForm.status}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        status: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">Check In</span>
                  <input
                    type="datetime-local"
                    value={correctionForm.check_in}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        check_in: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">Check Out</span>
                  <input
                    type="datetime-local"
                    value={correctionForm.check_out}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        check_out: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">Lunch Out</span>
                  <input
                    type="datetime-local"
                    value={correctionForm.lunch_out}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        lunch_out: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">
                    Lunch Expected Return
                  </span>
                  <input
                    type="datetime-local"
                    value={correctionForm.lunch_expected_return}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        lunch_expected_return: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">Lunch In</span>
                  <input
                    type="datetime-local"
                    value={correctionForm.lunch_in}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        lunch_in: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">Lunch Status</span>
                  <select
                    value={correctionForm.lunch_status}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        lunch_status: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  >
                    {LUNCH_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">OT Hours</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={correctionForm.overtime_hours}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        overtime_hours: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs text-muted mb-1">
                    Lunch Break Minutes
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={correctionForm.lunch_break_minutes}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        lunch_break_minutes: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-xs text-muted mb-1">
                    Lunch Late Minutes
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={correctionForm.lunch_late_minutes}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        lunch_late_minutes: e.target.value,
                      })
                    }
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50"
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-xs text-muted mb-1">
                    Correction Reason <span className="text-rose">*</span>
                  </span>
                  <textarea
                    rows={3}
                    value={correctionForm.reason}
                    onChange={(e) =>
                      setCorrectionForm({
                        ...correctionForm,
                        reason: e.target.value,
                      })
                    }
                    placeholder="Example: HR correction after employee submitted proof."
                    className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 resize-none"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRecord(null);
                    setCorrectionForm(null);
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingCorrection}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingCorrection ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save Correction
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
