import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { getConfig } from '../config';
import { RateLimitError } from '../shared/errors';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('rateLimiter');

let cacheRedis: Redis | null = null;

// Basic in-memory fallback to prevent 500s when Redis is down
const fallbackHits = new Map<string, number[]>();
// Prevent memory leaks in fallback map (clear every minute)
setInterval(() => fallbackHits.clear(), 60 * 1000).unref();

function getCacheRedis(): Redis {
    if (!cacheRedis) {
        const config = getConfig();
        cacheRedis = new Redis(config.REDIS_CACHE_URL);
    }
    return cacheRedis;
}

/**
 * Sliding Window Counter Rate Limiter
 *
 * Refactored from v1 (sorted sets) → v2 (sliding window counter).
 *
 * Why:
 *   v1 used ZADD + ZCARD — stores ONE sorted set member per request.
 *   At 200 req/min × 10,000 users = 2,000,000 sorted set members in Redis.
 *   Each member is ~50 bytes → ~100MB of Redis RAM just for rate limiting.
 *
 *   v2 uses a sliding window counter:
 *   - 2 keys per user per window (current + previous bucket)
 *   - Each key is a simple integer counter (INCR)
 *   - Weighted average of previous + current window estimates position in sliding window
 *   - O(1) memory per user regardless of request volume
 *
 * Algorithm (Cloudflare-style):
 *   weight = (windowMs - elapsedInCurrentWindow) / windowMs
 *   estimatedCount = previousWindowCount * weight + currentWindowCount
 *
 * Per TRD §07: Login: 5 attempts per IP per 15min. API: 200 req/min per user.
 */

// Lua script for atomic sliding window counter — runs entirely in Redis
const SLIDING_WINDOW_SCRIPT = `
local currentKey   = KEYS[1]
local previousKey  = KEYS[2]
local maxRequests  = tonumber(ARGV[1])
local windowMs     = tonumber(ARGV[2])
local now          = tonumber(ARGV[3])
local windowSec    = math.ceil(windowMs / 1000)

-- Get counts from both windows
local previousCount = tonumber(redis.call('GET', previousKey) or '0')
local currentCount  = tonumber(redis.call('GET', currentKey) or '0')

-- Calculate which bucket "now" falls into
local currentWindowStart = math.floor(now / windowMs) * windowMs
local elapsed = now - currentWindowStart

-- Weighted sliding window estimate
local weight = (windowMs - elapsed) / windowMs
local estimated = math.floor(previousCount * weight + currentCount)

if estimated >= maxRequests then
    return {0, estimated, maxRequests}
end

-- Increment current window counter
redis.call('INCR', currentKey)
redis.call('EXPIRE', currentKey, windowSec * 2)
redis.call('EXPIRE', previousKey, windowSec * 2)

return {1, estimated + 1, maxRequests}
`;

export function rateLimiter(options: {
    windowMs: number;
    max: number;
    keyPrefix: string;
    keyFn?: (req: Request) => string;
}) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const redis = getCacheRedis();
        const identifier = options.keyFn
            ? options.keyFn(req)
            : req.ctx?.user?.id || req.ip || 'anon';

        const now = Date.now();
        const currentWindow = Math.floor(now / options.windowMs);
        const previousWindow = currentWindow - 1;

        const currentKey = `rl:${options.keyPrefix}:${identifier}:${currentWindow}`;
        const previousKey = `rl:${options.keyPrefix}:${identifier}:${previousWindow}`;

        let allowed: number;
        let count: number;
        let limit: number;

        try {
            const result = await redis.eval(
                SLIDING_WINDOW_SCRIPT,
                2,
                currentKey,
                previousKey,
                options.max,
                options.windowMs,
                now
            ) as [number, number, number];
            [allowed, count, limit] = result;
        } catch (err) {
            log.error({ err, identifier }, 'Redis rate limiter failed! Circuit broken, falling back to in-memory limiter.');

            // In-memory sliding logic fallback
            const windowStart = now - options.windowMs;
            const fallbackKey = `fallback:${options.keyPrefix}:${identifier}`;
            let hits = fallbackHits.get(fallbackKey) || [];
            hits = hits.filter(timestamp => timestamp > windowStart);
            hits.push(now);
            fallbackHits.set(fallbackKey, hits);

            limit = options.max;
            count = hits.length;
            allowed = count > limit ? 0 : 1;
        }

        const windowSeconds = Math.ceil(options.windowMs / 1000);

        // Set standard rate limit headers
        res.set('X-RateLimit-Limit', String(limit));
        res.set('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
        res.set('X-RateLimit-Reset', String(Math.ceil((now + options.windowMs) / 1000)));

        if (!allowed) {
            res.set('Retry-After', String(windowSeconds));
            throw new RateLimitError(windowSeconds);
        }

        next();
    };
}

// Pre-configured rate limiters
export const loginRateLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    keyPrefix: 'login',
    keyFn: (req) => req.ip || 'unknown',
});

export const apiRateLimiter = rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    keyPrefix: 'api',
});

// Strict rate limiter for external AI model interactions
// Prevents billing abuse (e.g., max 10 requests per hour per user)
export const aiRateLimiter = rateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    keyPrefix: 'ai_model',
});
