import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const secret = process.env.SUPABASE_JWT_SECRET;
const userId = 'fb870772-72d4-44b5-bda0-ef97fd0d8567'; // From the sync script earlier

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const supabaseAnon = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
);

async function run() {
    console.log('Creating/getting test user...');
    const email = 'testapi@agency.gov';
    const password = 'SuperSecretPassword123!';

    // Try to create the user
    await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'admin' }
    });

    console.log('Logging in to get REAL token...');
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
        email,
        password
    });

    if (authError || !authData.session) {
        console.error('Failed to login:', authError);
        return;
    }

    const token = authData.session.access_token;
    console.log('Got real token. Sending request to backend...');

    try {
        const res = await axios.get('http://localhost:3001/api/v1/cases', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Response:', res.status, res.data);
    } catch (err: any) {
        console.error('❌ Request failed:');
        if (err.response) {
            console.error(err.response.status, err.response.data);
        } else {
            console.error(err.message);
        }
    }
}

run();
