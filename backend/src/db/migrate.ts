import runner from 'node-pg-migrate';
import { Client } from 'pg';
import path from 'path';
import { getConfig } from '../config';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('migrate');

/**
 * Programmatic migration runner.
 *
 * Uses the DIRECT_DATABASE_URL to bypass PgBouncer, as DDL statements 
 * (CREATE TABLE, ALTER TABLE, etc.) can cause issues with transaction pooling.
 */
export async function runMigrations(): Promise<void> {
    const config = getConfig();
    const dbUrl = config.DIRECT_DATABASE_URL || config.DATABASE_URL;

    log.info('Starting database migrations...');

    // We use a single Client, not a Pool, for migrations
    const client = new Client({
        connectionString: dbUrl,
    });

    try {
        await client.connect();

        const migrationsDir = path.join(__dirname, 'migrations');

        const migrations = await runner({
            dbClient: client as any,
            dir: migrationsDir,
            direction: 'up',
            migrationsTable: 'pgmigrations',
            ignorePattern: '.*\\.map$', // ignore sourcemaps if built
            verbose: true,
            log: (msg: string) => log.info(msg),
        });

        if (migrations.length === 0) {
            log.info('Database is already up to date.');
        } else {
            log.info(`Successfully applied ${migrations.length} migrations.`);
        }
    } catch (err: any) {
        log.error({ err }, 'Migration failed!');
        throw err;
    } finally {
        await client.end();
    }
}

// Allow running directly via CLI (e.g., `npm run migrate`)
if (require.main === module) {
    runMigrations()
        .then(() => {
            log.info('Migration script finished successfully.');
            process.exit(0);
        })
        .catch(() => {
            process.exit(1);
        });
}
