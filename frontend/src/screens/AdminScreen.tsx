import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Mail, CheckCircle, XCircle } from 'lucide-react';
import api from '../lib/api';

interface UserDto {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    mfaEnabled: boolean;
    lastLoginAt: string | null;
}

export const AdminScreen: React.FC = () => {

    const { data: users, isLoading, error } = useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            const { data } = await api.get('/admin/users');
            // Assuming the backend returns standard casing
            return (data.data || []).map((u: any) => ({
                id: u.id,
                email: u.email,
                fullName: u.full_name,
                role: u.role,
                isActive: u.is_active,
                mfaEnabled: u.mfa_enabled,
                lastLoginAt: u.last_login_at,
            })) as UserDto[];
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                <p>Failed to load user records. Ensure you have Admin privileges.</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-navy-600" />
                </div>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-800">User Management</h1>
                    <p className="text-sm text-slate-500">Governance and Role-Based Access Control</p>
                </div>
                <button className="aria-btn-primary">
                    Invite User
                </button>
            </div>

            <div className="aria-card overflow-hidden">
                <table className="aria-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>MFA Status</th>
                            <th>Last Login</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users?.map((u) => (
                            <tr key={u.id}>
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-xs border border-slate-200">
                                            {u.fullName.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-800">{u.fullName}</p>
                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <Mail className="w-3 h-3" />
                                                {u.email}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                            u.role === 'investigator' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                'bg-slate-100 text-slate-700 border border-slate-200'
                                        }`}>
                                        {u.role}
                                    </span>
                                </td>
                                <td>
                                    {u.mfaEnabled ? (
                                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                                            <CheckCircle className="w-3.5 h-3.5" /> Enforced
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-slate-400 text-xs">
                                            <XCircle className="w-3.5 h-3.5" /> Pending
                                        </span>
                                    )}
                                </td>
                                <td className="text-slate-500 text-sm">
                                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                                </td>
                                <td>
                                    {u.isActive ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Suspended
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {users?.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center p-8 text-slate-500">No users found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
