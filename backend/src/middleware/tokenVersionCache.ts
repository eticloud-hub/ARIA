import { Redis } from 'ioredis';
import { getConfig } from '../config';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('token-cache');

/**
 * Token Version Cache — Redis caching layer for JWT revocation checks.
 *
 * Cache-aside pattern:
 *   1. Check Redis cache (sub-ms)
 *   2. On miss → caller provides the value (from PG)
 *   3. Value is cached with TTL
 *
 * TTL 30s balances revocation latency (max 30s exposure after cache eviction
 * failure) vs. DB load reduction (~97% cache hit rate at steady state).
 *
 * Extracted into its own module to avoid circular dependency:
 *   auth.ts → AuthRepository → tokenVersionCache (no cycle)
 */

const TOKEN_VERSION_TTL_SECONDS = 30;
const TOKEN_VERSION_PREFIX = 'tv:';

let cacheRedis: Redis | null = null;

function getCacheRedis(): Redis {
    if (!cacheRedis) {
        const config = getConfig();
        cacheRedis = new Redis(config.REDIS_CACHE_URL);
    }
    return cacheRedis;
}

/**
 * Get a cached token_version for a user.
 * Returns the cached value, or null on cache miss.
 */
export async function getCachedTokenVersion(userId: string): Promise<number | null> {
    const redis = getCacheRedis();
    const cached = await redis.get(`${TOKEN_VERSION_PREFIX}${userId}`);
    return cached !== null ? parseInt(cached, 10) : null;
}

/**
 * Store a token_version in the Redis cache with TTL.
 * Fire-and-forget is acceptable — worst case is one extra PG query.
 */
export function cacheTokenVersion(userId: string, version: number): void {
    getCacheRedis()
        .set(`${TOKEN_VERSION_PREFIX}${userId}`, String(version), 'EX', TOKEN_VERSION_TTL_SECONDS)
        .catch((err) => {
            log.error({ err }, 'Failed to cache token_version');
        });
}

/**
 * Evict the cached token_version for a user.
 * Call on logout, ban, or password change to ensure immediate revocation.
 *
 * Even if this fails, the TTL guarantees eviction within 30s.
 */
export async function invalidateTokenVersionCache(userId: string): Promise<void> {
    try {
        await getCacheRedis().del(`${TOKEN_VERSION_PREFIX}${userId}`);
    } catch (err: any) {
        log.error({ err }, 'Failed to invalidate token_version cache');
    }
}
