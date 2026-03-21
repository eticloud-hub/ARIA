import { createClient, SupabaseClient } from '@supabase/supabase-js';

export let supabase: SupabaseClient;

export const initSupabase = (url: string, anonKey: string) => {
    supabase = createClient(url, anonKey);
};
