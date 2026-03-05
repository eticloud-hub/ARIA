import pino from 'pino';
import { getConfig } from '../config';

/**
 * ARIA — Structured JSON Logger (pino)
 *
 * Central logger singleton. All backend code imports from here.
 *
 * Features:
 *   - Structured JSON output in production (machine-parseable)
 *   - Pretty-printed output in development (human-readable)
 *   - Automatic PID, hostname, timestamp in every log line
 *   - Child loggers with bound context (requestId, module, userId)
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.info({ requestId, caseId }, 'Case created');
 *   logger.error({ err }, 'Database connection failed');
 *
 *   // Create a child logger with bound context:
 *   const log = logger.child({ module: 'auth', requestId });
 *   log.info('Token verified');  // → { module: "auth", requestId: "...", msg: "Token verified" }
 */

let cachedConfig: { NODE_ENV: string; LOG_LEVEL: string } | null = null;

function getLogConfig() {
    if (!cachedConfig) {
        try {
            const config = getConfig();
            cachedConfig = { NODE_ENV: config.NODE_ENV, LOG_LEVEL: config.LOG_LEVEL };
        } catch {
            // Config not yet parsed (e.g., during config validation itself)
            cachedConfig = {
                NODE_ENV: process.env.NODE_ENV || 'development',
                LOG_LEVEL: process.env.LOG_LEVEL || 'info',
            };
        }
    }
    return cachedConfig;
}

const logConfig = getLogConfig();

const isTest = logConfig.NODE_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

export const logger = pino({
    // In test mode, silence logs to keep test output clean (override with LOG_LEVEL=debug)
    level: isTest ? (logConfig.LOG_LEVEL || 'silent') : (logConfig.LOG_LEVEL || 'info'),

    // In development: use pino-pretty for readable output
    // In test: no transport (pino-pretty creates thread workers that keep Jest open)
    // In production: structured JSON (no transport overhead)
    ...(!isTest && logConfig.NODE_ENV === 'development'
        ? {
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss.l',
                    ignore: 'pid,hostname',
                },
            },
        }
        : {}),

    // Base bindings included in every log line
    base: {
        service: 'aria-api',
        env: logConfig.NODE_ENV,
    },

    // Timestamp format: ISO 8601 for production log aggregators
    timestamp: pino.stdTimeFunctions.isoTime,

    // Redact sensitive fields from logs
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'accessToken',
            'refreshToken',
            'mfa_secret',
        ],
        censor: '[REDACTED]',
    },

    // Serializers for standard error objects
    serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    },
});

/**
 * Create a child logger scoped to a specific module.
 * Use this at the top of a file for module-wide context.
 *
 * Example:
 *   const log = createModuleLogger('db');
 *   log.warn({ durationMs: 1200, query: sql }, 'Slow query');
 */
export function createModuleLogger(module: string) {
    return logger.child({ module });
}
