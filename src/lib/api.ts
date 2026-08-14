import supabase from './supabase';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Drop-in replacement for fetch() that attaches the Supabase session JWT as a
 * Bearer token so the Vercel /api routes can verify the caller via requireAuth().
 *
 * Refactor pages that currently call `fetch('/api/...')` to use `apiClient`
 * (or this function) so 401/403 handling lives in one place.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body?.error || message;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, message || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : undefined) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Centralized, typed API client used across the app. */
export const apiClient = {
  get<T = unknown>(path: string) {
    return apiFetch<T>(path);
  },
  post<T = unknown>(path: string, body?: unknown) {
    return apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  },
  put<T = unknown>(path: string, body?: unknown) {
    return apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  },
  del<T = unknown>(path: string) {
    return apiFetch<T>(path, { method: 'DELETE' });
  },
};

export default apiClient;
