import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseAnon = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
);

async function run() {
    console.log('Logging in to get REAL token...');
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
        email: 'testapi@agency.gov',
        password: 'SuperSecretPassword123!'
    });

    if (authError || !authData.session) {
        console.error('Failed to login:', authError);
        return;
    }

    const token = authData.session.access_token;
    console.log('Got real token.');
    
    // Decode header
    const decodedHeader = jwt.decode(token, { complete: true });
    console.log('JWT Header:', decodedHeader?.header);

    console.log('Testing jwt.verify with secret from .env...');
    const secret = process.env.SUPABASE_JWT_SECRET;
    try {
        jwt.verify(token, secret!, { algorithms: ['HS256'] });
        console.log('✅ Signature verified successfully!');
    } catch (err: any) {
        console.error('❌ Signature verification failed:', err.message);
    }
}

run();
