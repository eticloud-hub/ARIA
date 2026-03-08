import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
    session: Session | null;
    user: User | null;
    isAuthenticated: boolean;
    requiresMfa: boolean;

    setSession: (session: Session | null) => void;
    checkMfa: () => Promise<void>;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    user: null,
    isAuthenticated: false,
    requiresMfa: false,

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

// Global Auth Listener to keep Zustand in sync seamlessly
supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
});
