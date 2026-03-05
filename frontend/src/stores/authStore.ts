import { create } from 'zustand';

interface AuthUser {
    id: string;
    email: string;
    fullName: string;
    role: 'admin' | 'investigator' | 'reviewer';
}

interface AuthState {
    accessToken: string | null;
    user: AuthUser | null;
    isAuthenticated: boolean;
    requiresMfa: boolean;

    setAccessToken: (token: string) => void;
    setUser: (user: AuthUser) => void;
    setRequiresMfa: (requires: boolean) => void;
    logout: () => void;
}

/**
 * Auth Store — Zustand
 * Access tokens are stored ONLY in memory (JS variable).
 * Per TRD §07: "never localStorage" — prevents XSS token theft.
 */
export const useAuthStore = create<AuthState>((set) => ({
    accessToken: null,
    user: null,
    isAuthenticated: false,
    requiresMfa: false,

    setAccessToken: (token) =>
        set({ accessToken: token, isAuthenticated: true }),

    setUser: (user) => set({ user }),

    setRequiresMfa: (requires) => set({ requiresMfa: requires }),

    logout: () =>
        set({
            accessToken: null,
            user: null,
            isAuthenticated: false,
            requiresMfa: false,
        }),
}));
