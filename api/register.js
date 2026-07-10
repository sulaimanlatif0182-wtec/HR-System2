import supabase from './db-client.js';

// Server-side password policy — mirrors the frontend checklist.
function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password || '')) errors.push('one uppercase letter');
  if (!/[a-z]/.test(password || '')) errors.push('one lowercase letter');
  if (!/[0-9]/.test(password || '')) errors.push('one number');
  return errors;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // 1. Enforce password policy (server-side, cannot be bypassed)
    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) {
      return res.status(400).json({ error: `Password must contain ${pwErrors.join(', ')}.` });
    }

    // 2. Whitelist check — email must exist in the employee directory
    //    (i.e. the admin must have added this person first)
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, email')
      .ilike('email', cleanEmail)
      .limit(1);
    if (empErr) throw empErr;

    if (!employees || employees.length === 0) {
      return res.status(403).json({
        error: 'This email is not in the employee directory. Please contact your administrator to be added first.',
      });
    }

    // 3. Create the auth account using the service-role (admin) client.
    const { error: createErr } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });

    if (createErr) {
      const msg = (createErr.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
      }
      throw createErr;
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: err.message || 'Registration failed.' });
  }
}