import Redis from 'ioredis';
import { getConfig } from '../config';
import type { CachePort } from '../ports/cache.port';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('redis.cache');

export class RedisCacheAdapter implements CachePort {
    private client: Redis;

    constructor() {
        const config = getConfig();
        // Use a dedicated cache URL if available, fallback to the queue one
        this.client = new Redis(config.REDIS_CACHE_URL || config.REDIS_QUEUE_URL, {
            maxRetriesPerRequest: 1, // Fall open quickly circuit breaker
            showFriendlyErrorStack: true,
        });

        this.client.on('error', (err) => {
            log.error({ err }, 'Redis Cache connection error');
        });
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            if (this.client.status !== 'ready') return null;
            const data = await this.client.get(key);
            if (!data) return null;
            return JSON.parse(data) as T;
        } catch (err) {
            log.warn({ err, key }, 'Redis get failed, falling back...');
            return null; // Fallback to DB
        }
    }

    async set(key: string, value: unknown, ttlSeconds = 5): Promise<void> {
        try {
            if (this.client.status !== 'ready') return;
            await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        } catch (err) {
            log.warn({ err, key }, 'Redis set failed, safely ignoring');
        }
    }
}
