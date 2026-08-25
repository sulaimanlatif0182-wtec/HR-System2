process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key';

try {
  const m = await import('../api/index.js');
  console.log('IMPORTS OK, handler type:', typeof m.default);
} catch (err) {
  console.error('IMPORT FAILED:', err.message);
  if (err.code) console.error('code:', err.code);
  process.exit(1);
}