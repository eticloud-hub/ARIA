import React from 'react';
import { clsx } from 'clsx';
import { Check, Loader2, Circle, AlertTriangle } from 'lucide-react';

type StepStatus = 'pending' | 'active' | 'complete' | 'error' | 'skipped';

interface AnalysisStep {
    key: string;
    label: string;
    status: StepStatus;
    detail?: string;
}

interface AnalysisChecklistProps {
    steps: AnalysisStep[];
}

const STEP_ICONS: Record<StepStatus, React.ReactNode> = {
    pending: <Circle className="w-4 h-4 text-slate-300" />,
    active: <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />,
    complete: <Check className="w-4 h-4 text-emerald-500" />,
    error: <AlertTriangle className="w-4 h-4 text-red-500" />,
    skipped: <Circle className="w-4 h-4 text-slate-300" strokeDasharray="4 2" />,
};

/**
 * AnalysisChecklist — Vertical progress list
 * Per UX Spec §06: Ingest → 5 Dimensions → Report
 */
export const AnalysisChecklist: React.FC<AnalysisChecklistProps> = ({ steps }) => {
    return (
        <div className="space-y-0">
            {steps.map((step, idx) => (
                <div key={step.key} className="flex items-start gap-3 relative">
                    {/* Connecting line */}
                    {idx < steps.length - 1 && (
                        <div className="absolute left-[7px] top-6 w-0.5 h-full bg-slate-200" />
                    )}
                    {/* Icon */}
                    <div className="relative z-10 flex-shrink-0 mt-0.5">
                        {STEP_ICONS[step.status]}
                    </div>
                    {/* Content */}
                    <div className={clsx(
                        'pb-4',
                        step.status === 'active' && 'text-amber-800 font-medium',
                        step.status === 'complete' && 'text-slate-600',
                        step.status === 'pending' && 'text-slate-400',
                        step.status === 'error' && 'text-red-700 font-medium',
                    )}>
                        <p className="text-sm">{step.label}</p>
                        {step.detail && (
                            <p className="text-xs text-slate-500 mt-0.5">{step.detail}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

/**
 * Default analysis pipeline steps
 */
export function getDefaultAnalysisSteps(currentStep?: string): AnalysisStep[] {
    const allSteps: AnalysisStep[] = [
        { key: 'ingest', label: 'Artifact Ingestion & Normalization', status: 'pending' },
        { key: 'decision_pattern', label: 'Decision Pattern Analysis', status: 'pending' },
        { key: 'performance', label: 'Performance Consistency', status: 'pending' },
        { key: 'error_rate', label: 'Error Rate & Type Analysis', status: 'pending' },
        { key: 'behavioral_inertia', label: 'Behavioral Inertia', status: 'pending' },
        { key: 'cognitive_bias', label: 'Cognitive Bias Markers', status: 'pending' },
        { key: 'report', label: 'Report Generation', status: 'pending' },
    ];

    if (!currentStep) return allSteps;

    let found = false;
    return allSteps.map((step) => {
        if (step.key === currentStep) {
            found = true;
            return { ...step, status: 'active' as StepStatus };
        }
        return { ...step, status: found ? 'pending' : 'complete' as StepStatus };
    });
}
