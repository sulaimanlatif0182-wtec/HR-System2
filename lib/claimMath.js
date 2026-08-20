// Pure claim logic extracted from api/claims.js so it can be unit-tested
// without a database: claim type normalization, odometer distance math,
// role checks, and the insert payload builder.

export const ALLOWED_CLAIM_TYPES = [
  'Fuel',
  'Parking',
  'Toll',
  'Medical',
  'Accommodation',
  'Travel',
  'Office Supplies',
  'Other',
];

export function cleanString(value) {
  return String(value ?? '').trim();
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getDistanceKm(start, end) {
  const s = toNumber(start, 0);
  const e = toNumber(end, 0);

  if (!s || !e || e <= s) return 0;

  return Math.round((e - s) * 100) / 100;
}

export function isFinanceManager(actorRole, actorDepartment) {
  return (
    String(actorRole || '').toLowerCase() === 'manager' &&
    String(actorDepartment || '').trim().toLowerCase() === 'finance'
  );
}

export function isAdmin(actorRole) {
  return String(actorRole || '').toLowerCase() === 'admin';
}

export function isManager(actorRole) {
  return String(actorRole || '').toLowerCase() === 'manager';
}

export function sameDepartment(a, b) {
  return (
    String(a || '').trim().toLowerCase() ===
    String(b || '').trim().toLowerCase()
  );
}

export function normalizeClaimType(value) {
  const claimType = cleanString(value);

  return ALLOWED_CLAIM_TYPES.includes(claimType) ? claimType : 'Other';
}

export function buildClaimPayload(body = {}) {
  const claimType = normalizeClaimType(body.claim_type);
  const distanceKm = getDistanceKm(body.odometer_start, body.odometer_end);

  return {
    employee_id: Number(body.employee_id),
    claim_type: claimType,
    claim_date: body.claim_date,
    amount: toNumber(body.amount),
    description: cleanString(body.description),

    vehicle_no: claimType === 'Fuel' ? body.vehicle_no || null : null,
    from_location: body.from_location || null,
    to_location: body.to_location || null,

    odometer_start:
      claimType === 'Fuel' &&
      body.odometer_start !== undefined &&
      body.odometer_start !== ''
        ? toNumber(body.odometer_start)
        : null,

    odometer_end:
      claimType === 'Fuel' &&
      body.odometer_end !== undefined &&
      body.odometer_end !== ''
        ? toNumber(body.odometer_end)
        : null,

    distance_km: claimType === 'Fuel' && distanceKm ? distanceKm : null,

    fuel_liters:
      claimType === 'Fuel' &&
      body.fuel_liters !== undefined &&
      body.fuel_liters !== ''
        ? toNumber(body.fuel_liters)
        : null,

    petrol_station:
      claimType === 'Fuel' ? body.petrol_station || null : null,

    receipt_no: body.receipt_no || null,

    attachment_url: body.attachment_url,
    attachment_name: body.attachment_name || null,

    status: 'pending_manager',
    included_in_payroll: false,
  };
}
