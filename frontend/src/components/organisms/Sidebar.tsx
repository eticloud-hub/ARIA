import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
    LayoutDashboard,
    FolderOpen,
    Shield,
    Users,
    ScrollText,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';

const NAV_ITEMS = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['admin', 'investigator', 'reviewer'] },
    { icon: FolderOpen, label: 'Cases', path: '/cases', roles: ['admin', 'investigator', 'reviewer'] },
    { icon: Users, label: 'Users', path: '/admin/users', roles: ['admin'] },
    { icon: ScrollText, label: 'Audit Log', path: '/admin/audit', roles: ['admin'] },
];

/**
 * Sidebar — Main navigation
 * Per TRD §07: Role-aware navigation items
 */
export const Sidebar: React.FC = () => {
    const location = useLocation();
    const { user } = useAuthStore();
    const { sidebarCollapsed, toggleSidebar } = useUiStore();

    const filteredItems = NAV_ITEMS.filter(
        (item) => user && item.roles.includes(user.role)
    );

    return (
        <aside
            className={clsx(
                'fixed left-0 top-0 h-screen bg-navy-800 text-white flex flex-col z-30 transition-all duration-300',
                sidebarCollapsed ? 'w-16' : 'w-60'
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 h-16 border-b border-navy-700">
                <Shield className="w-8 h-8 text-forensic-amber flex-shrink-0" />
                {!sidebarCollapsed && (
                    <div>
                        <h1 className="text-lg font-bold tracking-tight">ARIA</h1>
                        <p className="text-[10px] text-navy-300 -mt-0.5">Forensic Attribution</p>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 space-y-1 px-2">
                {filteredItems.map((item) => {
                    const isActive = location.pathname === item.path ||
                        (item.path !== '/' && location.pathname.startsWith(item.path));

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={clsx(
                                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150',
                                isActive
                                    ? 'bg-navy-600 text-white font-medium'
                                    : 'text-navy-200 hover:bg-navy-700 hover:text-white'
                            )}
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            {!sidebarCollapsed && <span>{item.label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Collapse toggle */}
            <button
                onClick={toggleSidebar}
                className="flex items-center justify-center h-10 border-t border-navy-700 text-navy-300 hover:text-white transition-colors"
            >
                {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
        </aside>
    );
};
