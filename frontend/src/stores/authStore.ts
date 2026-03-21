import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
    session: Session | null;
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    requiresMfa: boolean;

    setSession: (session: Session | null) => void;
    setLoading: (loading: boolean) => void;
    checkMfa: () => Promise<void>;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    user: null,
    isAuthenticated: false,
    isLoading: true, // Starts true — cleared after initial session restore
    requiresMfa: false,

    setLoading: (loading) => set({ isLoading: loading }),

    setSession: (session) => {
        set({
            session,
            user: session?.user || null,
            isAuthenticated: !!session,
        });

        // Whenever a session is set/updated, verify AAL level
        if (session) {
            get().checkMfa();
        } else {
            set({ requiresMfa: false });
        }
    },

    checkMfa: async () => {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) {
            console.error('Failed to verify MFA assurance level', error);
            return;
        }

        // If user has set up MFA (aal2 is next), but hasn't verified it in this session yet (currently aal1)
        if (data.nextLevel === 'aal2' && data.currentLevel === 'aal1') {
            set({ requiresMfa: true });
        } else {
            set({ requiresMfa: false });
        }
    },

    logout: async () => {
        await supabase.auth.signOut();
        set({
            session: null,
            user: null,
            isAuthenticated: false,
            requiresMfa: false,
        });
    },
}));

/**
 * Initialize the auth system — SINGLE source of truth.
 *
 * 1. Fetch the existing session from Supabase (localStorage)
 * 2. Seed the Zustand store with it
 * 3. Clear the loading flag
 * 4. Subscribe to future auth state changes (login, logout, token refresh)
 *
 * This must be called ONCE in main.tsx after initSupabase().
 */
export const initAuthListener = async () => {
    // Step 1: Restore session from Supabase's internal storage
    const { data } = await supabase.auth.getSession();
    const store = useAuthStore.getState();

    // Step 2: Seed the store BEFORE clearing loading
    store.setSession(data.session);

    // Step 3: Mark initialization complete — ProtectedLayout can now make routing decisions
    store.setLoading(false);

    // Step 4: Subscribe to future changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
    // We skip the INITIAL_SESSION event since we already handled it above.
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return; // Already handled above
        useAuthStore.getState().setSession(session);
    });
};
