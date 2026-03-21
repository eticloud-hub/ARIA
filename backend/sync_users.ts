import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Fix path to .env since this runs via tsx
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DIRECT_DATABASE_URL;

if (!supabaseUrl || !serviceRoleKey || !dbUrl) {
    console.error('Missing required environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const pool = new Pool({ 
    connectionString: dbUrl, 
    ssl: { rejectUnauthorized: false } 
});

async function run() {
    console.log('Fetching users from Supabase Auth...');
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
        console.error('Failed to list users:', error);
        process.exit(1);
    }

    if (!users || users.length === 0) {
        console.log('No users found in Supabase Auth.');
        process.exit(0);
    }

    // Ensure at least one organization exists
    let orgId: string;
    const { rows: orgs } = await pool.query('SELECT id FROM organisations LIMIT 1');
    if (orgs.length > 0) {
        orgId = orgs[0].id;
    } else {
        const { rows: newOrg } = await pool.query(`
            INSERT INTO organisations (name, domain) 
            VALUES ('Default Agency', 'agency.gov') 
            RETURNING id
        `);
        orgId = newOrg[0].id;
        console.log(`Created default organisation: ${orgId}`);
    }

    console.log(`Found ${users.length} users. Syncing to public.users...`);

    for (const user of users) {
        const role = user.user_metadata?.role || 'admin';
        
        try {
            await pool.query(`
                INSERT INTO users (id, email, full_name, role, organisation_id, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE 
                SET email = EXCLUDED.email, role = EXCLUDED.role;
            `, [user.id, user.email, 'Admin User', role, orgId]);
            
            console.log(`✅ Synced user ${user.email} (ID: ${user.id}) with role: ${role}`);
        } catch (err: any) {
            console.error(`❌ Failed to sync user ${user.email}:`, err.message);
        }
    }

    await pool.end();
    console.log('Sync complete.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
