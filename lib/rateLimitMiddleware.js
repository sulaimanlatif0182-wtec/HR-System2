import { isRateLimited, getClientIp } from './rateLimit.js';

export function createRateLimitMiddleware({ windowMs = 60 * 1000, max = 100, keyPrefix = 'api' } = {}) {
  return async function rateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}:${req.method}:${req.url}`;
    
    try {
      const limited = await isRateLimited(key, { windowMs, max });
      
      if (limited) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({ 
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - 1));
      
      if (typeof next === 'function') next();
    } catch (err) {
      console.error('Rate limiter error:', err);
      if (typeof next === 'function') next();
    }
  };
}

export const strictRateLimit = createRateLimitMiddleware({ windowMs: 60 * 1000, max: 10, keyPrefix: 'strict' });
export const moderateRateLimit = createRateLimitMiddleware({ windowMs: 60 * 1000, max: 50, keyPrefix: 'moderate' });
export const looseRateLimit = createRateLimitMiddleware({ windowMs: 60 * 1000, max: 100, keyPrefix: 'loose' });
export const authRateLimit = createRateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'auth' });