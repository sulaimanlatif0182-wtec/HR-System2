import { createClient } from '@supabase/supabase-js';

export const REMEMBER_KEY = 'wtec-remember';
export const REMEMBERED_EMAIL_KEY = 'wtec-remembered-email';

// Storage adapter that respects the "Remember me" choice:
// - Remember me ON  -> session persisted in localStorage (survives browser restart)
// - Remember me OFF -> session kept in sessionStorage (cleared when the tab/browser closes)
const rememberAwareStorage = {
  getItem: (key: string): string | null => {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    const remember = window.localStorage.getItem(REMEMBER_KEY);
    if (remember === 'false') {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    }
  },
  removeItem: (key: string): void => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

const supabase = createClient(
  'https://zupgcikgkzahfdsznwae.supabase.co',
  'sb_publishable_pR1eGP55DWPLURniEoq4og_b3W4rJBv',
  {
    auth: {
      storage: rememberAwareStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export default supabase;   // ← THIS LINE must be the last line