import { Pool, PoolClient } from 'pg';
import { getPool } from '../db/pool';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('repo');

const VALID_TABLES = new Set([
    'organisations',
    'users',
    'cases',
    'artifacts',
    'analysis_jobs',
    'analysis_results',
    'reports',
    'report_annotations',
    'audit_events',
    'pending_jobs',
    'refresh_tokens'
]);

/**
 * BaseRepository — Abstract base for all data-access repositories.
 *
 * Why this exists:
 * - Services previously embedded raw SQL, mixing business logic with queries.
 * - Repositories isolate ALL SQL behind typed methods.
 * - Services depend on repository interfaces, not on `pg` directly.
 * - Makes services unit-testable without a running database.
 *
 * Usage:
 *   class CaseRepository extends BaseRepository { ... }
 *   const repo = new CaseRepository();
 *   const cases = await repo.query<Case>('SELECT ...', [orgId]);
 */
export abstract class BaseRepository {
    protected get pool(): Pool {
        return getPool();
    }

    /**
     * Run a parameterized query against the pool.
     * Returns typed rows and rowCount.
     */
    protected async query<T = Record<string, unknown>>(
        text: string,
        params?: unknown[]
    ): Promise<{ rows: T[]; rowCount: number | null }> {
        const start = Date.now();
        const result = await this.pool.query(text, params);
        const duration = Date.now() - start;

        if (duration > 1000) {
            log.warn({ durationMs: duration, query: text.substring(0, 120) }, 'Slow query detected');
        }

        return { rows: result.rows as T[], rowCount: result.rowCount };
    }

    /**
     * Run a query within an existing transaction client.
     * Use this when multiple operations must be atomic.
     */
    protected async queryWithClient<T = Record<string, unknown>>(
        client: PoolClient,
        text: string,
        params?: unknown[]
    ): Promise<{ rows: T[]; rowCount: number | null }> {
        const result = await client.query(text, params);
        return { rows: result.rows as T[], rowCount: result.rowCount };
    }

    /**
     * Execute a callback within a transaction.
     * BEGIN/COMMIT/ROLLBACK managed automatically.
     */
    public async transaction<T>(
        callback: (client: PoolClient) => Promise<T>
    ): Promise<T> {
        const client = await this.pool.connect();
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

    /**
     * Find a single row by ID within an org scope.
     * Returns null if not found (no throw — callers decide).
     */
    protected async findById<T>(
        table: string,
        id: string,
        organisationId: string,
        softDelete = true
    ): Promise<T | null> {
        if (!VALID_TABLES.has(table)) {
            throw new Error(`Invalid table name requested: ${table}`);
        }

        const softDeleteClause = softDelete ? ' AND deleted_at IS NULL' : '';
        const { rows } = await this.query<T>(
            `SELECT * FROM ${table} WHERE id = $1 AND organisation_id = $2${softDeleteClause}`,
            [id, organisationId]
        );
        return rows[0] ?? null;
    }
}
