import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initSupabase } from './lib/supabase';
import axios from 'axios';

async function bootstrap() {
    try {
        // Fetch public configuration from the server to avoid hardcoded secrets
        const { data } = await axios.get('/api/v1/config');
        initSupabase(data.supabaseUrl, data.supabaseAnonKey);
        
        // Initialize auth: restore session + subscribe to future changes
        // Must complete BEFORE React renders to prevent flash-redirect
        const { initAuthListener } = await import('./stores/authStore');
        await initAuthListener();

        ReactDOM.createRoot(document.getElementById('root')!).render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
    } catch (err) {
        console.error('Failed to bootstrap application:', err);
        document.body.innerHTML = `
            <div style="padding: 2rem; font-family: sans-serif; text-align: center; color: #334155;">
                <h2>Failed to load configuration</h2>
                <p>Ensure the ARIA API is running before starting the frontend.</p>
            </div>
        `;
    }
}

bootstrap();
