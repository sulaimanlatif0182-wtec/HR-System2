// Remove test accounts from Supabase: employee directory rows + auth login users.
// Usage: node scripts/remove-test-accounts.mjs
// Reads URL + service-role key from .env (never hardcoded, never printed).
// Edit TARGET_EMAILS below for other removals. Deletion is permanent.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const TARGET_EMAILS = [
  'manager.test@wtecgroup.com.my',
  'staff.test@wtecgroup.com.my',
  'worker.test@wtecgroup.com.my',
  'tmp.1790040211295.test@wtecgroup.com.my',
];

function envValue(text, key) {
  const line = text.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, '') : '';
}

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const supabaseUrl = envValue(envText, 'VITE_SUPABASE_URL');
const serviceKey = envValue(envText, 'SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseUrl || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HISTORY_TABLES = ['attendance', 'leave_requests', 'claims', 'payroll'];
const results = [];

for (const email of TARGET_EMAILS) {
  const row = { email, authDeleted: false, rowDeleted: false, history: {}, error: '' };
  try {
    const { data: emp, error: findErr } = await supabase
      .from('employees')
      .select('id, name, email')
      .ilike('email', email)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!emp) {
      row.error = 'no employee row found';
    } else {
      row.id = emp.id;
      row.name = emp.name;
      for (const table of HISTORY_TABLES) {
        const { count, error: countErr } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', emp.id);
        row.history[table] = countErr ? `err:${countErr.message}` : count;
      }
      const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) throw listErr;
      const authUser = (usersPage?.users || []).find(
        (u) => String(u.email || '').toLowerCase() === email.toLowerCase()
      );
      if (authUser) {
        const { error: delAuthErr } = await supabase.auth.admin.deleteUser(authUser.id);
        if (delAuthErr) throw new Error(`auth delete failed: ${delAuthErr.message}`);
        row.authDeleted = true;
      } else {
        row.authDeleted = 'no auth user';
      }
      const { error: delRowErr } = await supabase.from('employees').delete().eq('id', emp.id);
      if (delRowErr) throw new Error(`row delete failed: ${delRowErr.message}`);
      row.rowDeleted = true;
    }
  } catch (err) {
    row.error = err instanceof Error ? err.message : String(err);
  }
  results.push(row);
  console.log(JSON.stringify(row));
}

// Verify absence
for (const email of TARGET_EMAILS) {
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  const { data: usersPage } = await supabase.auth.admin.listUsers();
  const stillAuth = (usersPage?.users || []).some(
    (u) => String(u.email || '').toLowerCase() === email.toLowerCase()
  );
  console.log(`VERIFY email=${email} rowPresent=${Boolean(emp)} authPresent=${stillAuth}`);
}
