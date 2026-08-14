import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email();

export function parseAccountEmail(value) {
  const result = emailSchema.safeParse(value);

  if (!result.success) {
    return { success: false, error: 'A valid email address is required.' };
  }

  return { success: true, email: result.data };
}

const profileUpdateSchema = z
  .object({
    phone: z.string().trim().max(40).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    bank_account_no: z.string().trim().max(60).optional().nullable(),
    epf_no: z.string().trim().max(40).optional().nullable(),
    socso_no: z.string().trim().max(40).optional().nullable(),
    income_tax_no: z.string().trim().max(40).optional().nullable(),
    emergency_contact_name: z.string().trim().max(120).optional().nullable(),
    emergency_contact_relationship: z.string().trim().max(60).optional().nullable(),
    emergency_contact_phone: z.string().trim().max(40).optional().nullable(),
    marital_status: z.string().trim().max(40).optional().nullable(),
    number_of_children: z.coerce.number().int().min(0).max(30).optional().nullable(),
  })
  .strict();

export function parseProfileUpdate(payload) {
  const result = profileUpdateSchema.safeParse(payload ?? {});

  if (!result.success) {
    const first = result.error.issues[0];
    return {
      success: false,
      error: `${first?.path?.[0] ?? 'field'}: ${first?.message ?? 'invalid'}`,
    };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------
const idSchema = z.coerce.number().int().positive();
const employeeIdSchema = z.coerce.number().int().positive();
const passwordSchema = z.string().trim().min(8).max(200);
const nameSchema = z.string().trim().min(1).max(120);
const reasonSchema = z.string().trim().min(1).max(2000);

function firstError(result) {
  const first = result.error.issues[0];
  return first?.message ?? 'Invalid request payload.';
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export function parseRegister(payload) {
  const result = registerSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Worker login (uses employee_no)
// ---------------------------------------------------------------------------
const workerLoginSchema = z
  .object({
    employee_no: z.coerce.string().trim().min(1).max(40),
  })
  .strict();

export function parseWorkerLogin(payload) {
  const result = workerLoginSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Device auth (action-routed POST/PUT)
// ---------------------------------------------------------------------------
const deviceAuthActionSchema = z.enum([
  'registration_options',
  'registration_verify',
  'authentication_options',
  'authentication_verify',
  'approve',
  'revoke',
]);

export function parseDeviceAuth(payload) {
  const result = deviceAuthActionSchema.safeParse((payload ?? {}).action);

  if (!result.success) {
    return { success: false, error: 'Invalid or missing device-auth action.' };
  }

  return { success: true, data: { action: result.data } };
}

// ---------------------------------------------------------------------------
// Leave request (create)
// ---------------------------------------------------------------------------
const leaveRequestSchema = z
  .object({
    employee_id: employeeIdSchema,
    leave_type: z.string().trim().min(1).max(80),
    reason: reasonSchema,
    duties_covered_by: z.string().trim().min(1).max(200),
  })
  .passthrough();

export function parseLeaveRequest(payload) {
  const result = leaveRequestSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Claim (create)
// ---------------------------------------------------------------------------
const claimSchema = z
  .object({
    employee_id: employeeIdSchema,
    claim_date: z.string().trim().min(1).max(20),
    amount: z.coerce.number().positive(),
    description: reasonSchema,
    claim_type: z.string().trim().max(60).optional().nullable(),
  })
  .passthrough();

export function parseClaim(payload) {
  const result = claimSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Attendance — clock in
// ---------------------------------------------------------------------------
const attendanceCheckInSchema = z
  .object({
    employee_id: employeeIdSchema,
    date: z.string().trim().min(1).max(20),
    check_in: z.string().trim().min(1).max(40),
  })
  .passthrough();

export function parseAttendanceCheckIn(payload) {
  const result = attendanceCheckInSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Attendance — clock out
// ---------------------------------------------------------------------------
const attendanceCheckOutSchema = z
  .object({
    id: idSchema,
    check_out: z.string().trim().min(1).max(40),
  })
  .passthrough();

export function parseAttendanceCheckOut(payload) {
  const result = attendanceCheckOutSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Attendance — correction request create
// ---------------------------------------------------------------------------
const attendanceCorrectionRequestSchema = z
  .object({
    employee_id: employeeIdSchema,
    request_date: z.string().trim().min(1).max(20),
    reason: reasonSchema,
  })
  .passthrough();

export function parseAttendanceCorrectionRequest(payload) {
  const result = attendanceCorrectionRequestSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Attendance — correction request decision
// ---------------------------------------------------------------------------
const attendanceCorrectionDecisionSchema = z
  .object({
    status: z.string().trim().min(1).max(40),
  })
  .passthrough();

export function parseAttendanceCorrectionDecision(payload) {
  const result = attendanceCorrectionDecisionSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Attendance — holiday upsert
// ---------------------------------------------------------------------------
const attendanceHolidayUpsertSchema = z
  .object({
    holiday_date: z.string().trim().min(1).max(20),
    name: nameSchema,
  })
  .passthrough();

export function parseAttendanceHolidayUpsert(payload) {
  const result = attendanceHolidayUpsertSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Attendance — manual correction
// ---------------------------------------------------------------------------
const attendanceManualCorrectionSchema = z
  .object({
    id: idSchema,
    reason: reasonSchema,
  })
  .passthrough();

export function parseAttendanceManualCorrection(payload) {
  const result = attendanceManualCorrectionSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Payroll — create record
// ---------------------------------------------------------------------------
const payrollCreateSchema = z
  .object({
    employee_id: employeeIdSchema,
    period: z.string().trim().min(1).max(20),
  })
  .passthrough();

export function parsePayrollCreate(payload) {
  const result = payrollCreateSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Payroll — save employee profile
// ---------------------------------------------------------------------------
const payrollProfileSchema = z
  .object({
    employee_id: employeeIdSchema,
  })
  .passthrough();

export function parsePayrollProfile(payload) {
  const result = payrollProfileSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
export function parseId(payload) {
  const result = idSchema.safeParse((payload ?? {}).id);

  if (!result.success) {
    return { success: false, error: 'A valid numeric id is required.' };
  }

  return { success: true, data: { id: result.data } };
}

export function parsePeriod(payload) {
  const result = z
    .object({ period: z.string().trim().min(1).max(20) })
    .safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: 'period is required.' };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Departments — create
// ---------------------------------------------------------------------------
const departmentCreateSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

export function parseDepartmentCreate(payload) {
  const result = departmentCreateSchema.safeParse(payload ?? {});

  if (!result.success) {
    return { success: false, error: firstError(result) };
  }

  return { success: true, data: result.data };
}
