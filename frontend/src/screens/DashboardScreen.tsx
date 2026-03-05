import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, FolderOpen, Activity, FileCheck, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '../components/atoms/StatusBadge';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';
import type { CaseDto } from '../lib/adapters';
import { adaptCase } from '../lib/adapters';

/**
 * DashboardScreen — S-03
 * Case Management Dashboard — paginated case list with status badges.
 */
export const DashboardScreen: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [cases, setCases] = useState<CaseDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadCases();
    }, []);

    const loadCases = async () => {
        try {
            const { data } = await api.get('/cases?limit=50');
            const adapted = (data.data || []).map(adaptCase);
            setCases(adapted);
        } catch {
            // Handle error
        } finally {
            setLoading(false);
        }
    };

    const filteredCases = cases.filter(
        (c) =>
            c.title.toLowerCase().includes(search.toLowerCase()) ||
            c.referenceId.toLowerCase().includes(search.toLowerCase())
    );

    const stats = {
        total: cases.length,
        active: cases.filter((c) => ['ingesting', 'queued', 'analysing'].includes(c.status)).length,
        complete: cases.filter((c) => c.status === 'complete').length,
        errors: cases.filter((c) => c.status === 'error').length,
    };

    return (
        <div className="animate-fade-in">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total Cases', value: stats.total, icon: FolderOpen, color: 'text-navy-600 bg-navy-50' },
                    { label: 'Active Analysis', value: stats.active, icon: Activity, color: 'text-amber-600 bg-amber-50' },
                    { label: 'Completed', value: stats.complete, icon: FileCheck, color: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Errors', value: stats.errors, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
                ].map((stat) => (
                    <div key={stat.label} className="aria-card p-4">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
                                <stat.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                                <p className="text-xs text-slate-500">{stat.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions bar */}
            <div className="flex items-center justify-between mb-4">
                <div className="relative w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        id="case-search"
                        type="text"
                        placeholder="Search cases by title or reference ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="aria-input pl-10"
                    />
                </div>
                {user?.role !== 'reviewer' && (
                    <Link to="/cases/new" className="aria-btn-primary" id="create-case-btn">
                        <Plus className="w-4 h-4" />
                        New Case
                    </Link>
                )}
            </div>

            {/* Cases table */}
            <div className="aria-card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
                    </div>
                ) : filteredCases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <FolderOpen className="w-12 h-12 mb-3" />
                        <p className="text-sm">{search ? 'No cases match your search.' : 'No cases yet. Create your first case to begin.'}</p>
                    </div>
                ) : (
                    <table className="aria-table">
                        <thead>
                            <tr>
                                <th>Reference</th>
                                <th>Title</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCases.map((c) => (
                                <tr
                                    key={c.id}
                                    onClick={() => navigate(`/cases/${c.id}`)}
                                    id={`case-row-${c.id}`}
                                >
                                    <td>
                                        <span className="font-mono text-xs text-navy-600 font-medium">
                                            {c.referenceId}
                                        </span>
                                    </td>
                                    <td className="font-medium text-slate-800">{c.title}</td>
                                    <td>
                                        <StatusBadge status={c.status} />
                                    </td>
                                    <td className="text-slate-500 text-xs">
                                        {c.createdAt.toLocaleDateString()}
                                    </td>
                                    <td className="text-slate-500 text-xs">
                                        {c.updatedAt.toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
