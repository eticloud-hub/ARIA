import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import { CaseRepository } from './src/repositories/CaseRepository';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const repo = new CaseRepository(pool);
    try {
        console.log('Testing CaseRepository.findByOrgId...');
        // Use the default test org from sync_users
        const { rows } = await pool.query('SELECT id FROM organisations LIMIT 1');
        if (rows.length === 0) throw new Error('No org found');
        
        await repo.findByOrgId(rows[0].id, { limit: 100 });
        console.log('✅ Success!');
    } catch (err: any) {
        console.error('❌ Database error:');
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
