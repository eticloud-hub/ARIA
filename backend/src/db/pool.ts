import { Pool, PoolClient } from 'pg';
import { getConfig } from '../config';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('db');

/**
 * Database Connection Manager
 *
 * Architecture: Node.js app → PgBouncer (transaction pooling) → PostgreSQL
 *
 * The node-pg pool here is a thin CLIENT-SIDE pool. PgBouncer manages the
 * real server connections. Keep DB_POOL_SIZE small (default: 5) because
 * PgBouncer multiplexes many client connections onto fewer server connections.
 *
 * With PgBouncer in transaction mode:
 *   - Connections are returned to PgBouncer's pool after each transaction
 *   - SET/PREPARE statements don't persist across transactions
 *   - node-pg's pool is just a local buffer to avoid reconnect overhead
 */

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        const config = getConfig();
        pool = new Pool({
            connectionString: config.DATABASE_URL,
            max: config.DB_POOL_SIZE,
            // Shorter idle timeout — PgBouncer recycles connections quickly
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 5000,
            ssl: { rejectUnauthorized: false }, // Enforced by Supabase
        });

        pool.on('error', (err) => {
            log.error({ err }, 'Unexpected pool error');
        });
    }
    return pool;
}

/**
 * Graceful pool shutdown — drain connections before exit.
 * Called by the SIGTERM handler in index.ts.
 */
export async function shutdownPool(): Promise<void> {
    if (pool) {
        log.info('Draining connection pool...');
        await pool.end();
        pool = null;
        log.info('Pool drained');
    }
}

/**
 * Startup health check. Verify connection to the transaction pooler.
 */
export async function testDbConnection(): Promise<void> {
    try {
        const client = await getPool().connect();
        log.info('✅ Successfully connected to the PostgreSQL transaction pooler.');
        client.release();
    } catch (err) {
        log.error({ err }, '❌ Failed to connect to the PostgreSQL transaction pooler.');
        throw err;
    }
}

export async function query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
): Promise<{ rows: T[]; rowCount: number | null }> {
    const start = Date.now();
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
        log.warn({ durationMs: duration, query: text.substring(0, 120) }, 'Slow query detected');
    }

    return { rows: result.rows as T[], rowCount: result.rowCount };
}

export async function transaction<T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
