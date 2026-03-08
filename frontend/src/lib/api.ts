import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';

/**
 * ARIA API Client with Interceptors
 * Per TRD: JWT stored in memory only (never localStorage).
 * Automatic token refresh on 401.
 */
const api = axios.create({
    baseURL: '/api/v1',
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true, // Send cookies (refresh token)
});

// Request interceptor — attach access token
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    // Rely on supabase to refresh the session automatically if expired
    const { data } = await import('./supabase').then(m => m.supabase.auth.getSession());
    const token = data.session?.access_token;

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        if (error.response?.status === 401) {
            useAuthStore.getState().logout();
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;

// --- Type-safe API helpers ---
export interface ApiResponse<T> {
    data: T;
    meta: {
        request_id: string;
        timestamp: string;
        pagination?: { cursor: string | null; has_more: boolean; total?: number };
    };
    error: null;
}

export interface ApiErrorResponse {
    data: null;
    meta: { request_id: string; timestamp: string };
    error: { code: string; message: string; field?: string; request_id: string };
}
