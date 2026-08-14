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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// If Supabase's token-refresh endpoint rejects our stored refresh token
// (HTTP 400 — "Invalid Refresh Token"), the persisted session is dead
// (e.g. the project's JWT secret was rotated or the session was revoked).
// Left alone it keeps firing /auth/v1/token?grant_type=refresh_token with a
// 400 on every load and attaches an unusable JWT to /api/* calls. We detect
// that response and wipe the stale Supabase auth keys so the app cleanly
// falls back to the login / worker-kiosk screen instead of getting stuck.
function clearStaleSupabaseSession() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        storage.removeItem(key);
      }
    }
  }
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: rememberAwareStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await fetch(input, init);

        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        if (
          res.status === 400 &&
          typeof url === 'string' &&
          url.includes('/auth/v1/token') &&
          url.includes('grant_type=refresh_token')
        ) {
          queueMicrotask(clearStaleSupabaseSession);
        }

        return res;
      },
    },
  }
);

export default supabase;   // ← THIS LINE must be the last line