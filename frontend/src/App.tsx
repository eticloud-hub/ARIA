import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { useUiStore } from './stores/uiStore';
import { tryRestoreSession } from './lib/authApi';
import { Sidebar } from './components/organisms/Sidebar';
import { Header } from './components/organisms/Header';
import { LoginScreen } from './screens/LoginScreen';
import { MFAScreen } from './screens/MFAScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { CaseCreateScreen } from './screens/CaseCreateScreen';
import { CaseDetailScreen } from './screens/CaseDetailScreen';
import { clsx } from 'clsx';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60_000, // 1 minute
            retry: 1,
        },
    },
});

// Protected route wrapper
const ProtectedLayout: React.FC = () => {
    const { isAuthenticated, requiresMfa } = useAuthStore();
    const { sidebarCollapsed } = useUiStore();

    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (requiresMfa) return <Navigate to="/mfa" replace />;

    return (
        <div className="min-h-screen bg-slate-50">
            <Sidebar />
            <div className={clsx(
                'transition-all duration-300',
                sidebarCollapsed ? 'ml-16' : 'ml-60'
            )}>
                <Header />
                <main className="p-6">
                    <Outlet />
                </main>
            </div>

            {/* Toast container */}
            <ToastContainer />
        </div>
    );
};

// Toast notifications
const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useUiStore();

    return (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={clsx(
                        'p-4 rounded-lg shadow-lg border animate-slide-up cursor-pointer',
                        toast.type === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
                        toast.type === 'error' && 'bg-red-50 border-red-200 text-red-800',
                        toast.type === 'warning' && 'bg-amber-50 border-amber-200 text-amber-800',
                        toast.type === 'info' && 'bg-blue-50 border-blue-200 text-blue-800',
                    )}
                    onClick={() => removeToast(toast.id)}
                >
                    <p className="text-sm font-medium">{toast.title}</p>
                    {toast.message && <p className="text-xs mt-0.5 opacity-80">{toast.message}</p>}
                </div>
            ))}
        </div>
    );
};

const App: React.FC = () => {
    const [isRestoring, setIsRestoring] = useState(true);

    useEffect(() => {
        tryRestoreSession().finally(() => setIsRestoring(false));
    }, []);

    if (isRestoring) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-slate-300 border-t-emerald-600 rounded-full animate-spin"></div>
                    <p className="mt-4 text-slate-500 font-medium">Restoring session...</p>
                </div>
            </div>
        );
    }

    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    {/* Public routes */}
                    <Route path="/login" element={<LoginScreen />} />
                    <Route path="/mfa" element={<MFAScreen />} />

                    {/* Protected routes */}
                    <Route element={<ProtectedLayout />}>
                        <Route path="/" element={<DashboardScreen />} />
                        <Route path="/cases/new" element={<CaseCreateScreen />} />
                        <Route path="/cases/:id" element={<CaseDetailScreen />} />
                    </Route>

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    );
};

export default App;
