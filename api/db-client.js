import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing Supabase URL. Please set SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or VITE_SUPABASE_URL in Vercel environment variables.'
  );
}

if (!supabaseServiceKey) {
  throw new Error(
    'Missing Supabase service key. Please set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in Vercel environment variables.'
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: async (url, options) => {
      const res = await fetch(url, options);

      if (!res.ok && res.status >= 500) {
        triggerRestore();
      }

      return res;
    },
  },
});

export default supabase;