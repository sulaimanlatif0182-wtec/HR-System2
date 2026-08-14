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
