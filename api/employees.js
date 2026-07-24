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

function cleanString(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function normalizeIdentityLast4(value, type) {
  const raw = cleanString(value);

  if (type === 'IC') {
    return raw.replace(/\D/g, '').slice(0, 4);
  }

  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);

  return Number.isInteger(number) ? number : null;
}

function pickProfileUpdateData(data = {}) {
  const allowed = [
    'phone',
    'address',
    'bank_name',
    'bank_account_no',
    'epf_no',
    'socso_no',
    'income_tax_no',
    'emergency_contact_name',
    'emergency_contact_relationship',
    'emergency_contact_phone',
    'marital_status',
    'number_of_children',
  ];

  const result = {};

  allowed.forEach((key) => {
    if (data[key] !== undefined) {
      result[key] =
        key === 'number_of_children'
          ? toNullableInteger(data[key]) || 0
          : cleanString(data[key]) || null;
    }
  });

  return result;
}

function buildEmployeePayload(body, { partial = false } = {}) {
  const payload = {};

  const assign = (key, value) => {
    if (partial) {
      if (value !== undefined) payload[key] = value;
    } else {
      payload[key] = value;
    }
  };

  assign('name', body.name ? cleanString(body.name) : partial ? undefined : '');
  assign('email', body.email ? normalizeEmail(body.email) : partial ? undefined : '');
  assign('title', body.title ? cleanString(body.title) : partial ? undefined : null);
  assign(
    'department',
    body.department ? cleanString(body.department) : partial ? undefined : null
  );
  assign('phone', body.phone ? cleanString(body.phone) : partial ? undefined : null);
  assign(
    'location',
    body.location ? cleanString(body.location) : partial ? undefined : null
  );
  assign('role', body.role ? cleanString(body.role) : partial ? undefined : 'employee');
  assign(
    'status',
    body.status ? cleanString(body.status) : partial ? undefined : 'active'
  );
  assign(
    'join_date',
    body.join_date
      ? cleanString(body.join_date)
      : partial
        ? undefined
        : new Date().toISOString().slice(0, 10)
  );

  if (body.salary !== undefined || !partial) {
    assign('salary', toNullableNumber(body.salary));
  }

  assign(
    'date_of_birth',
    body.date_of_birth
      ? cleanString(body.date_of_birth)
      : partial
        ? undefined
        : null
  );

  assign(
    'identity_type',
    body.identity_type ? cleanString(body.identity_type) : partial ? undefined : null
  );

  if (body.identity_last4 !== undefined || !partial) {
    const identityType = body.identity_type ? cleanString(body.identity_type) : 'IC';

    assign(
      'identity_last4',
      body.identity_last4
        ? normalizeIdentityLast4(body.identity_last4, identityType)
        : partial
          ? undefined
          : null
    );
  }

  const extraTextFields = [
    'bank_name',
    'bank_account_no',
    'epf_no',
    'socso_no',
    'income_tax_no',
    'address',
    'emergency_contact_name',
    'emergency_contact_relationship',
    'emergency_contact_phone',
    'marital_status',
  ];

  extraTextFields.forEach((field) => {
    assign(field, body[field] ? cleanString(body[field]) : partial ? undefined : null);
  });

  if (body.number_of_children !== undefined || !partial) {
    assign('number_of_children', toNullableInteger(body.number_of_children) ?? 0);
  }

  const dateFields = [
    'probation_end_date',
    'contract_end_date',
    'work_permit_expiry',
    'passport_expiry',
    'driving_license_expiry',
    'medical_checkup_expiry',
  ];

  dateFields.forEach((field) => {
    assign(field, body[field] ? cleanString(body[field]) : partial ? undefined : null);
  });

  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // =========================
    // GET EMPLOYEE / EMPLOYEES
    // Supports:
    // /api/employees
    // /api/employees?email=test@email.com
    // /api/employees?id=1
    // =========================
    if (req.method === 'GET') {
      const { email, id, documents, employee_id, profile_update_requests } = req.query;

      if (profile_update_requests === 'true') {
        let query = supabase
          .from('employee_profile_update_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (employee_id) {
          query = query.eq('employee_id', Number(employee_id));
        }

        const { data, error } = await query;

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        return res.status(200).json(data || []);
      }

      if (documents === 'true') {
        const employeeId = Number(employee_id || id);

        if (!employeeId) {
          return res.status(400).json({
            error: 'employee_id is required for documents.',
          });
        }

        const { data, error } = await supabase
          .from('employee_documents')
          .select('*')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false });

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(data || []);
      }

      if (req.query?.document_signed_url === 'true') {
        const documentId = Number(req.query.document_id);

        if (!documentId) {
          return res.status(400).json({
            error: 'document_id is required.',
          });
        }

        const { data: documentRow, error: documentError } = await supabase
          .from('employee_documents')
          .select('*')
          .eq('id', documentId)
          .maybeSingle();

        if (documentError) {
          return res.status(500).json({
            error: documentError.message,
          });
        }

        if (!documentRow) {
          return res.status(404).json({
            error: 'Document not found.',
          });
        }

        if (!documentRow.file_path) {
          if (documentRow.file_url) {
            return res.status(200).json({
              signedUrl: documentRow.file_url,
              expiresIn: null,
              legacyPublicUrl: true,
            });
          }

          return res.status(400).json({
            error: 'Document file path is missing.',
          });
        }

        const expiresIn = 600;
        const { data: signedData, error: signedError } = await supabase.storage
          .from('employee-documents')
          .createSignedUrl(documentRow.file_path, expiresIn);

        if (signedError) {
          return res.status(500).json({
            error: signedError.message,
          });
        }

        return res.status(200).json({
          signedUrl: signedData?.signedUrl,
          expiresIn,
        });
      }

      if (email) {
        const cleanEmail = normalizeEmail(email);

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(data || null);
      }

      if (id) {
        const employeeId = Number(id);

        if (!employeeId) {
          return res.status(400).json({
            error: 'Valid employee ID is required.',
          });
        }

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('id', employeeId)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        return res.status(200).json(data || null);
      }

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json(data || []);
    }

    // =========================
    // ADD EMPLOYEE
    // =========================
    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'profile_update_request_create') {
        const employeeId = Number(body.employee_id);
        const requestedData = pickProfileUpdateData(body.requested_data || body);

        if (!employeeId || Object.keys(requestedData).length === 0) {
          return res.status(400).json({
            error: 'employee_id and at least one requested field are required.',
          });
        }

        const { data, error } = await supabase
          .from('employee_profile_update_requests')
          .insert({
            employee_id: employeeId,
            requested_by: body.requested_by || employeeId,
            requested_by_name: body.requested_by_name || null,
            requested_data: requestedData,
            reason: body.reason ? cleanString(body.reason) : null,
            status: 'pending',
          })
          .select()
          .single();

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        await safeInsertSystemAudit({
          module: 'employee_profile',
          action: 'profile_update_request_create',
          record_id: data?.id || null,
          employee_id: employeeId,
          changed_by: body.requested_by || employeeId,
          changed_by_name: body.requested_by_name || null,
          new_data: data,
          reason: body.reason || null,
        });

        return res.status(201).json(data);
      }

      if (body.action === 'document_create') {
        const employeeId = Number(body.employee_id);

        if (!employeeId || !body.title || !body.file_path) {
          return res.status(400).json({
            error: 'employee_id, title and file_path are required.',
          });
        }

        const { data, error } = await supabase
          .from('employee_documents')
          .insert({
            employee_id: employeeId,
            document_type: body.document_type || 'Other HR Document',
            title: cleanString(body.title),
            file_url: body.file_url || null,
            file_path: body.file_path,
            visibility: body.visibility || 'hr_only',
            uploaded_by: body.uploaded_by || null,
            uploaded_by_name: body.uploaded_by_name || null,
          })
          .select()
          .single();

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        await safeInsertSystemAudit({
          module: 'employee_documents',
          action: 'document_upload',
          record_id: data?.id || null,
          employee_id: data?.employee_id || employeeId,
          changed_by: body.uploaded_by || null,
          changed_by_name: body.uploaded_by_name || null,
          new_data: data,
        });

        return res.status(201).json(data);
      }

      if (!body.name || !body.email) {
        return res.status(400).json({
          error: 'Name and email are required.',
        });
      }

      const payload = buildEmployeePayload(body, { partial: false });

      const { data, error } = await supabase
        .from('employees')
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
    // EDIT EMPLOYEE
    // Admin-only in UI; API updates provided fields
    // =========================
    if (req.method === 'PUT') {
      const body = req.body || {};

      if (body.action === 'profile_update_decision') {
        const requestId = Number(body.id || body.request_id);
        const decision = cleanString(body.status).toLowerCase();

        if (!requestId || !['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({
            error: 'Valid request id and status approved/rejected are required.',
          });
        }

        const { data: requestRow, error: requestError } = await supabase
          .from('employee_profile_update_requests')
          .select('*')
          .eq('id', requestId)
          .maybeSingle();

        if (requestError) return res.status(500).json({ error: requestError.message });
        if (!requestRow) return res.status(404).json({ error: 'Request not found.' });
        if (requestRow.status !== 'pending') {
          return res.status(409).json({ error: 'Request already decided.' });
        }

        let updatedEmployee = null;

        if (decision === 'approved') {
          const { data: employeeData, error: employeeError } = await supabase
            .from('employees')
            .update(pickProfileUpdateData(requestRow.requested_data || {}))
            .eq('id', requestRow.employee_id)
            .select()
            .single();

          if (employeeError) return res.status(500).json({ error: employeeError.message });
          updatedEmployee = employeeData;
        }

        const { data, error } = await supabase
          .from('employee_profile_update_requests')
          .update({
            status: decision,
            admin_remarks: body.admin_remarks || null,
            decided_by: body.decided_by || null,
            decided_by_name: body.decided_by_name || null,
            decided_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestId)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        await safeInsertSystemAudit({
          module: 'employee_profile',
          action: `profile_update_${decision}`,
          record_id: requestId,
          employee_id: requestRow.employee_id,
          changed_by: body.decided_by || null,
          changed_by_name: body.decided_by_name || null,
          old_data: requestRow,
          new_data: { request: data, employee: updatedEmployee },
          reason: body.admin_remarks || null,
        });

        return res.status(200).json(data);
      }

      const id = Number(body.id || req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'Employee ID is required.',
        });
      }

      const { data: existing, error: findError } = await supabase
        .from('employees')
        .select('id, email, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) {
        return res.status(500).json({
          error: findError.message,
        });
      }

      if (!existing) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      const payload = buildEmployeePayload(body, { partial: true });

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({
          error: 'No fields to update.',
        });
      }

      const { data, error } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json({
        success: true,
        employee: data,
      });
    }

    // =========================
    // SOFT DELETE / DEACTIVATE EMPLOYEE
    // Does NOT remove employee from database.
    // Only changes status to inactive.
    // =========================
    if (req.method === 'DELETE') {
      const documentId = Number(req.query.document_id);

      if (documentId) {
        const { data: documentRow, error: findError } = await supabase
          .from('employee_documents')
          .select('*')
          .eq('id', documentId)
          .maybeSingle();

        if (findError) {
          return res.status(500).json({
            error: findError.message,
          });
        }

        if (!documentRow) {
          return res.status(404).json({
            error: 'Document not found.',
          });
        }

        const { error } = await supabase
          .from('employee_documents')
          .delete()
          .eq('id', documentId);

        if (error) {
          return res.status(500).json({
            error: error.message,
          });
        }

        if (documentRow.file_path) {
          await supabase.storage
            .from('employee-documents')
            .remove([documentRow.file_path]);
        }

        await safeInsertSystemAudit({
          module: 'employee_documents',
          action: 'document_delete',
          record_id: documentId,
          employee_id: documentRow.employee_id || null,
          changed_by: req.query.changed_by || null,
          changed_by_name: req.query.changed_by_name || null,
          old_data: documentRow,
        });

        return res.status(200).json({ success: true });
      }

      const id = Number(req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'Employee ID is required.',
        });
      }

      const { data: employee, error: findError } = await supabase
        .from('employees')
        .select('id, name, role, status')
        .eq('id', id)
        .maybeSingle();

      if (findError) {
        return res.status(500).json({
          error: findError.message,
        });
      }

      if (!employee) {
        return res.status(404).json({
          error: 'Employee not found.',
        });
      }

      const role = String(employee.role || '').toLowerCase();

      if (role === 'admin') {
        return res.status(403).json({
          error: 'Admin profile cannot be deactivated from this action.',
        });
      }

      if (employee.status === 'inactive') {
        return res.status(200).json({
          success: true,
          message: 'Employee is already inactive.',
          employee,
        });
      }

      const { data, error: updateError } = await supabase
        .from('employees')
        .update({
          status: 'inactive',
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          error: updateError.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Employee deactivated successfully.',
        employee: data,
      });
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