import api from './api';
import type { ApiResponse } from './api';
import { useAuthStore } from '../stores/authStore';

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
    id: string;
    email: string;
    fullName: string;
    role: 'admin' | 'investigator' | 'reviewer';
}

export interface LoginResponse {
    accessToken: string;
    requiresMfa: boolean;
    user: AuthUser;
}

export interface MfaVerifyResponse {
    accessToken: string;
}

export interface RefreshResponse {
    accessToken: string;
}

// ============================================================================
// Auth API Service
// ============================================================================

/**
 * Login with email + password.
 *
 * On success:
 *   - Stores the access token in memory (Zustand)
 *   - Sets user profile
 *   - Returns `requiresMfa` flag for the MFA gate
 *
 * The refresh token is automatically stored as an HttpOnly cookie
 * by the backend (never touches JS).
 */
export async function login(
    email: string,
    password: string
): Promise<LoginResponse> {
    const { data } = await api.post<ApiResponse<LoginResponse>>(
        '/auth/login',
        { email, password }
    );

    const result = data.data;
    const store = useAuthStore.getState();

    store.setAccessToken(result.accessToken);
    store.setUser(result.user);

    if (result.requiresMfa) {
        store.setRequiresMfa(true);
    }

    return result;
}

/**
 * Verify MFA TOTP code.
 *
 * Called after login when `requiresMfa === true`.
 * On success, upgrades the JWT to mfa-verified and clears the MFA gate.
 */
export async function verifyMfa(code: string): Promise<MfaVerifyResponse> {
    const { data } = await api.post<ApiResponse<MfaVerifyResponse>>(
        '/auth/mfa/verify',
        { code }
    );

    const result = data.data;
    const store = useAuthStore.getState();

    // Replace the pre-MFA token with the upgraded one
    store.setAccessToken(result.accessToken);
    store.setRequiresMfa(false);

    return result;
}

/**
 * Refresh the access token using the HttpOnly refresh cookie.
 *
 * This is called automatically by the 401 interceptor in api.ts,
 * but can also be called manually (e.g., on app startup to restore session).
 */
export async function refreshToken(): Promise<string> {
    const { data } = await api.post<ApiResponse<RefreshResponse>>(
        '/auth/refresh'
    );

    const newToken = data.data.accessToken;
    useAuthStore.getState().setAccessToken(newToken);

    return newToken;
}

/**
 * Logout — revokes the refresh token and clears all client state.
 *
 * The backend revokes the refresh token in the DB and clears the HttpOnly cookie.
 * We clear the in-memory access token immediately regardless of API success.
 */
export async function logout(): Promise<void> {
    try {
        await api.post('/auth/logout');
    } catch {
        // Best-effort — clear local state even if the API call fails
        // (e.g., network error, token already expired)
    } finally {
        useAuthStore.getState().logout();
    }
}

/**
 * Attempt to restore session on app startup.
 *
 * If the user has a valid refresh cookie, this will silently fetch
 * a new access token. If not, the user remains logged out.
 *
 * Call this in your App's useEffect or route guard.
 */
export async function tryRestoreSession(): Promise<boolean> {
    try {
        await refreshToken();
        return true;
    } catch {
        return false;
    }
}
