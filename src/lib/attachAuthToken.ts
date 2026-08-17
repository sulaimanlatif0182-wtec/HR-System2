import supabase from './supabase';

// Attach the Supabase session JWT to every relative /api/* request so the
// Vercel routes can verify the caller via requireAuth(). Supabase's own
// fetches (https://<project>.supabase.co/...) do NOT contain '/api/' and are
// left untouched. This is a single global hook so we don't have to edit the
// ~100 individual fetch('/api/...') call sites across the app.
const originalFetch = window.fetch.bind(window);

(window as unknown as { fetch: typeof fetch }).fetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

  if (url.includes('/api/')) {
    // getSession can hang when the gotrue auth-token lock is orphaned
    // (in-flight token refresh / sign-out). Bound it so /api/* requests fail
    // fast (server returns 401) instead of hanging the page on a loader.
    const { data } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 6000)
      ),
    ]);
    const token = data.session?.access_token;
    if (token) {
      const headers = new Headers(init.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers };
    }
  }

  return originalFetch(input, init);
};

export {};
