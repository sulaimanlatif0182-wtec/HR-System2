// Lightweight in-memory sliding-window rate limiter.
//
// NOTE: On Vercel serverless each invocation may run on a different instance,
// so this is best-effort per-instance protection (not a global throttle). For
// strict limits use an external store (Upstash Redis / Supabase). It still
// stops tight loops from a single caller within one warm instance window.

const buckets = new Map();

export function isRateLimited(key, { windowMs = 60 * 1000, max = 10 } = {}) {
  const now = Date.now();
  const rec = buckets.get(key);

  if (!rec || now - rec.first > windowMs) {
    buckets.set(key, { first: now, count: 1 });
    return false;
  }

  rec.count += 1;

  if (rec.count > max) {
    if (now - rec.first <= windowMs) return true;
    buckets.set(key, { first: now, count: 1 });
    return false;
  }

  return false;
}

export function clearRateLimiter() {
  buckets.clear();
}
