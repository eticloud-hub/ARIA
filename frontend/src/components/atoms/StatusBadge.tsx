import React from 'react';
import { clsx } from 'clsx';

type Status = 'draft' | 'ingesting' | 'queued' | 'analysing' | 'complete' | 'error' | 'pending' | 'uploading' | 'valid' | 'running' | 'failed';

const STATUS_CONFIG: Record<Status, { label: string; className: string; dot: string }> = {
    draft: { label: 'Draft', className: 'aria-badge-draft', dot: 'bg-slate-400' },
    pending: { label: 'Pending', className: 'aria-badge-draft', dot: 'bg-slate-400' },
    uploading: { label: 'Uploading', className: 'aria-badge-analyzing', dot: 'bg-amber-500' },
    ingesting: { label: 'Ingesting', className: 'aria-badge-analyzing', dot: 'bg-amber-500' },
    queued: { label: 'Queued', className: 'aria-badge-queued', dot: 'bg-blue-500' },
    analysing: { label: 'Analysing', className: 'aria-badge-analyzing', dot: 'bg-amber-500 animate-pulse' },
    running: { label: 'Running', className: 'aria-badge-analyzing', dot: 'bg-amber-500 animate-pulse' },
    complete: { label: 'Complete', className: 'aria-badge-complete', dot: 'bg-emerald-500' },
    valid: { label: 'Verified', className: 'aria-badge-complete', dot: 'bg-emerald-500' },
    error: { label: 'Error', className: 'aria-badge-error', dot: 'bg-red-500' },
    failed: { label: 'Failed', className: 'aria-badge-error', dot: 'bg-red-500' },
};

interface StatusBadgeProps {
    status: Status;
    size?: 'sm' | 'md';
    showDot?: boolean;
}

/**
 * StatusBadge — Pill-shaped status indicator
 * Per UX Spec §06: Strict color mapping, no ambiguous states.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
    status,
    size = 'md',
    showDot = true,
}) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;

    return (
        <span
            className={clsx(
                config.className,
                size === 'sm' && 'text-[10px] px-2 py-0.5'
            )}
        >
            {showDot && (
                <span className={clsx('w-1.5 h-1.5 rounded-full', config.dot)} />
            )}
            {config.label}
        </span>
    );
};
