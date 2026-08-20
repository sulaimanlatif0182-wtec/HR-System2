// Sliding-window rate limiter with a shared Supabase backing store.
//
// On Vercel serverless, each invocation may run on a different instance, so
// in-memory state alone cannot throttle globally. The rate_limits table
// provides a shared sliding window; the in-memory Map remains as a fallback
// so a DB outage never removes ALL protection (and catches tight loops on a
// single warm instance).

const buckets = new Map();

/** Best-effort client IP from Vercel proxy headers. */
export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return String(forwarded).split(',')[0].trim() || 'anon';
  }
  return req.socket?.remoteAddress || req.ip || 'anon';
}

async function remoteIsLimited(key, { windowMs, max }) {
  const now = new Date().toISOString();

  try {
    const { supabase } = await import('./db-client.js');

    // Atomic path (migration 0005): row-locked bump, immune to the
    // read-then-upsert race between concurrent requests.
    const { data, error: rpcError } = await supabase.rpc('rate_limit_bump', {
      p_key: key,
      p_window_ms: windowMs,
      p_max: max,
    });
    if (!rpcError && typeof data === 'boolean') {
      return data;
    }

    const { data: row } = await supabase
      .from('rate_limits')
      .select('key, window_start, count')
      .eq('key', key)
      .maybeSingle();

    if (!row) {
      await supabase.from('rate_limits').upsert(
        { key, window_start: now, count: 1, updated_at: now },
        { onConflict: 'key' }
      );
      return false;
    }

    const windowStart = new Date(row.window_start).getTime();
    if (Date.now() - windowStart > windowMs) {
      await supabase
        .from('rate_limits')
        .update({ window_start: now, count: 1, updated_at: now })
        .eq('key', key);
      return false;
    }

    const nextCount = Number(row.count || 0) + 1;
    await supabase
      .from('rate_limits')
      .update({ count: nextCount, updated_at: now })
      .eq('key', key);

    return nextCount > max;
  } catch (err) {
    console.error('Rate limiter remote check failed, using memory fallback:', err?.message || err);
    return memoryIsLimited(key, { windowMs, max });
  }
}

function memoryIsLimited(key, { windowMs, max }) {
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

export async function isRateLimited(key, { windowMs = 60 * 1000, max = 10 } = {}) {
  return remoteIsLimited(key, { windowMs, max });
}

export function clearRateLimiter() {
  buckets.clear();
}