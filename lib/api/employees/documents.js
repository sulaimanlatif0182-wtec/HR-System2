import { supabase } from '../../lib/db-client.js';
import { requireAuth } from '../../lib/requireAuth.js';
import { assertAdmin, assertAdminOrManager } from '../../lib/authorize.js';
import { setCors } from '../../lib/cors.js';
import { dbError } from '../../lib/errors.js';
import { safeInsertSystemAudit } from '../employees/index.js';
import { recordExists, cleanString, nullableTimestamp, nullableNumber } from './helpers.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  try {
    if (req.method === 'GET') {
      if (req.query.documents === 'true') {
        const employeeId = Number(req.query.employee_id || req.query.id);
        if (!employeeId) return res.status(400).json({ error: 'employee_id is required for documents.' });
        const { data, error } = await supabase.from('employee_documents').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false });
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }

      if (req.query.document_signed_url === 'true') {
        const documentId = Number(req.query.document_id);
        if (!documentId) return res.status(400).json({ error: 'document_id is required.' });
        const { data: documentRow, error: documentError } = await supabase.from('employee_documents').select('*').eq('id', documentId).maybeSingle();
        if (documentError) return res.status(500).json({ error: documentError.message });
        if (!documentRow) return res.status(404).json({ error: 'Document not found.' });
        if (!documentRow.file_path) {
          if (documentRow.file_url) return res.status(200).json({ signedUrl: documentRow.file_url, expiresIn: null, legacyPublicUrl: true });
          return res.status(400).json({ error: 'Document file path is missing.' });
        }
        const expiresIn = 600;
        const { data: signedData, error: signedError } = await supabase.storage.from('employee-documents').createSignedUrl(documentRow.file_path, expiresIn);
        if (signedError) return res.status(500).json({ error: signedError.message });
        return res.status(200).json({ signedUrl: signedData?.signedUrl, expiresIn });
      }

      if (req.query.profile_update_requests === 'true') {
        let query = supabase.from('employee_profile_update_requests').select('*').order('created_at', { ascending: false }).limit(500);
        if (req.query.employee_id) query = query.eq('employee_id', Number(req.query.employee_id));
        const { data, error } = await query;
        if (error) return dbError(res, error);
        return res.status(200).json(data || []);
      }

      return res.status(400).json({ error: 'Invalid query parameters.' });
    }

    if (req.method === 'POST') {
      if (!assertAdminOrManager(authUser, res)) return;

      const body = req.body || {};

      if (body.action === 'profile_update_request_create') {
        const employeeId = Number(body.employee_id);
        const { pickProfileUpdateData } = await import('../../lib/employeeLogic.js');
        const requestedData = pickProfileUpdateData(body.requested_data || body);
        if (body.requested_data) {
          const { parseProfileUpdate } = await import('../../lib/validators.js');
          const parsedProfile = parseProfileUpdate(body.requested_data);
          if (!parsedProfile.success) return res.status(400).json({ error: parsedProfile.error });
        }
        if (!employeeId || Object.keys(requestedData).length === 0) return res.status(400).json({ error: 'employee_id and at least one requested field are required.' });

        const { data: pendingRequest, error: pendingRequestError } = await supabase.from('employee_profile_update_requests').select('id').eq('employee_id', employeeId).eq('status', 'pending').limit(1).maybeSingle();
        if (pendingRequestError) return res.status(500).json({ error: pendingRequestError.message });
        if (pendingRequest) return res.status(409).json({ error: 'You already have a pending profile update request.' });

        const { data, error } = await supabase.from('employee_profile_update_requests').insert({ employee_id: employeeId, requested_by: body.requested_by || employeeId, requested_by_name: body.requested_by_name || null, requested_data: requestedData, reason: body.reason ? cleanString(body.reason) : null, status: 'pending' }).select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'employee_profile', action: 'profile_update_request_create', record_id: data?.id || null, employee_id: employeeId, changed_by: body.requested_by || employeeId, changed_by_name: body.requested_by_name || null, new_data: data, reason: body.reason || null });
        return res.status(201).json(data);
      }

      if (body.action === 'document_create') {
        const employeeId = Number(body.employee_id);
        if (!employeeId || !body.title || !body.file_path) return res.status(400).json({ error: 'employee_id, title and file_path are required.' });
        if (await recordExists('employee_documents', [['employee_id', employeeId], ['document_type', body.document_type || 'Other HR Document'], ['title', cleanString(body.title), 'ilike']])) return res.status(409).json({ error: 'This employee already has a document with the same type and title.' });

        const { data, error } = await supabase.from('employee_documents').insert({ employee_id: employeeId, document_type: body.document_type || 'Other HR Document', title: cleanString(body.title), file_url: body.file_url || null, file_path: body.file_path, visibility: body.visibility || 'hr_only', uploaded_by: body.uploaded_by || null, uploaded_by_name: body.uploaded_by_name || null }).select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'employee_documents', action: 'document_upload', record_id: data?.id || null, employee_id: data?.employee_id || employeeId, changed_by: body.uploaded_by || null, changed_by_name: body.uploaded_by_name || null, new_data: data });
        return res.status(201).json(data);
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    if (req.method === 'PUT') {
      if (!assertAdmin(authUser, res)) return;

      const body = req.body || {};

      if (body.action === 'profile_update_decision') {
        const requestId = Number(body.id || body.request_id);
        const decision = cleanString(body.status).toLowerCase();
        if (!requestId || !['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Valid request id and status approved/rejected are required.' });

        const { data: requestRow, error: requestError } = await supabase.from('employee_profile_update_requests').select('*').eq('id', requestId).maybeSingle();
        if (requestError) return res.status(500).json({ error: requestError.message });
        if (!requestRow) return res.status(404).json({ error: 'Request not found.' });
        if (requestRow.status !== 'pending') return res.status(409).json({ error: 'Request already decided.' });

        let updatedEmployee = null;
        if (decision === 'approved') {
          const { pickProfileUpdateData } = await import('../../lib/employeeLogic.js');
          const { data: employeeData, error: employeeError } = await supabase.from('employees').update(pickProfileUpdateData(requestRow.requested_data || {})).eq('id', requestRow.employee_id).select().single();
          if (employeeError) return res.status(500).json({ error: employeeError.message });
          updatedEmployee = employeeData;
        }

        const { data, error } = await supabase.from('employee_profile_update_requests').update({ status: decision, admin_remarks: body.admin_remarks || null, decided_by: body.decided_by || null, decided_by_name: body.decided_by_name || null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', requestId).select().single();
        if (error) return dbError(res, error);

        await safeInsertSystemAudit({ module: 'employee_profile', action: `profile_update_${decision}`, record_id: requestId, employee_id: requestRow.employee_id, changed_by: body.decided_by || null, changed_by_name: body.decided_by_name || null, old_data: requestRow, new_data: { request: data, employee: updatedEmployee }, reason: body.admin_remarks || null });
        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    if (req.method === 'DELETE') {
      if (!assertAdmin(authUser, res)) return;

      const documentId = Number(req.query.document_id);
      if (documentId) {
        const { data: documentRow, error: findError } = await supabase.from('employee_documents').select('*').eq('id', documentId).maybeSingle();
        if (findError) return res.status(500).json({ error: findError.message });
        if (!documentRow) return res.status(404).json({ error: 'Document not found.' });
        const { error } = await supabase.from('employee_documents').delete().eq('id', documentId);
        if (error) return dbError(res, error);
        if (documentRow.file_path) await supabase.storage.from('employee-documents').remove([documentRow.file_path]);
        await safeInsertSystemAudit({ module: 'employee_documents', action: 'document_delete', record_id: documentId, employee_id: documentRow.employee_id || null, changed_by: req.query.changed_by || null, changed_by_name: req.query.changed_by_name || null, old_data: documentRow });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'document_id is required.' });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (err) {
    console.error('Documents/Profile Updates API error:', err);
    return dbError(res, err);
  }
}
