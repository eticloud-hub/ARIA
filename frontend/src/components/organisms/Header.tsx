import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { LogOut, User } from 'lucide-react';
import api from '../../lib/api';

/**
 * Header — Top bar with user info and logout
 */
export const Header: React.FC = () => {
    const { user, logout } = useAuthStore();

    const handleLogout = async () => {
        try {
            await api.post('/auth/logout');
        } catch {
            // Logout even if API call fails
        }
        logout();
    };

    return (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
            <div>
                <h2 className="text-sm font-medium text-slate-500">
                    AI-Rendered Intent Analyzer
                </h2>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-navy-600" />
                    </div>
                    <div>
                        <p className="font-medium text-slate-700">{user?.fullName}</p>
                        <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="aria-btn-ghost p-2 text-slate-400 hover:text-red-500"
                    title="Logout"
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </div>
        </header>
    );
};
