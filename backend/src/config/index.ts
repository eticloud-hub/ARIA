import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(3001),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),

    // Database — direct PG connection for local development
    DATABASE_URL: z.string().default('postgresql://aria_admin:aria_dev_password@localhost:5433/aria'),
    DIRECT_DATABASE_URL: z.string().default('postgresql://aria_admin:aria_dev_password@localhost:5433/aria'),

    // Redis
    REDIS_QUEUE_URL: z.string().default('redis://localhost:6379'),
    REDIS_CACHE_URL: z.string().default('redis://localhost:6380'),

    // JWT
    // Supabase
    SUPABASE_URL: z.string().url().default('http://localhost:54321'),
    SUPABASE_ANON_KEY: z.string().min(1).default('ey...'),
    SUPABASE_JWT_SECRET: z.string().min(32).default('super-secret-supabase-jwt-key-that-is-at-least-32-chars!'),

    // S3
    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().default('minioadmin'),
    S3_SECRET_KEY: z.string().default('minioadmin'),
    S3_ARTIFACTS_BUCKET: z.string().default('aria-artifacts'),
    S3_REPORTS_BUCKET: z.string().default('aria-reports'),
    S3_PRESIGNED_URL_TTL: z.coerce.number().default(86400), // 24h

    // HABD
    HABD_MIMICRY_THRESHOLD: z.coerce.number().default(25),
    HABD_CONFIDENCE_MINIMUM: z.coerce.number().default(0.6),

    // Logging
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Database pool — keep small when using PgBouncer (it manages the real pool)
    // PgBouncer default_pool_size=20 handles the upstream connections
    DB_POOL_SIZE: z.coerce.number().min(1).max(50).default(5),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
    if (!_config) {
        const result = envSchema.safeParse(process.env);
        if (!result.success) {
            // NOTE: console.error is intentional here — the pino logger depends
            // on config, so it's not available when config validation fails.
            console.error('❌ Invalid environment configuration:');
            console.error(result.error.format());
            process.exit(1);
        }
        _config = result.data;
    }
    return _config;
}
