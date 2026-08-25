import { vi } from 'vitest';

Object.defineProperty(global, 'fetch', { value: vi.fn(), writable: true });
Object.defineProperty(global, 'Request', { value: vi.fn(), writable: true });
Object.defineProperty(global, 'Response', { value: vi.fn(), writable: true });
Object.defineProperty(global, 'Headers', { value: vi.fn(), writable: true });

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      admin: { createUser: vi.fn().mockResolvedValue({ error: null }) },
    },
    storage: {
      listBuckets: vi.fn().mockResolvedValue({ data: [], error: null }),
      createBucket: vi.fn().mockResolvedValue({ error: null }),
      from: () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'test' }, error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

vi.mock('../../lib/db-client.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: { admin: { createUser: vi.fn().mockResolvedValue({ error: null }) } },
    storage: { listBuckets: vi.fn().mockResolvedValue({ data: [], error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../../lib/feature-flags.js', () => ({
  getFeatureFlags: vi.fn().mockResolvedValue([]),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
  saveFeatureFlag: vi.fn().mockResolvedValue({}),
  saveFeatureFlags: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/rateLimit.js', () => ({
  isRateLimited: vi.fn().mockResolvedValue(false),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../../server/email.js', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

console.log = vi.fn();
console.error = vi.fn();
console.warn = vi.fn();