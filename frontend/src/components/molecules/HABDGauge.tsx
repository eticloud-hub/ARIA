import React, { useMemo } from 'react';
import { clsx } from 'clsx';

interface HABDGaugeProps {
    score: number;           // 0-100
    confidenceLow: number;   // Lower bound of 95% CI
    confidenceHigh: number;  // Upper bound of 95% CI
    mimicryFlag?: boolean;
    size?: number;           // SVG size in px
}

/**
 * HABD Gauge — Radial score visualization
 * Per UX Spec §06: 0-100 score + 95% Confidence Interval display.
 * Score interpretation:
 *   0-30:  Strong AI indicators (red)
 *   31-50: Inconclusive (amber)
 *   51-75: Likely human (green-ish)
 *   76-100: Strong human indicators (green)
 */
export const HABDGauge: React.FC<HABDGaugeProps> = ({
    score,
    confidenceLow,
    confidenceHigh,
    mimicryFlag = false,
    size = 200,
}) => {
    const { color, label, strokeOffset, circumference } = useMemo(() => {
        const r = 45;
        const circ = 2 * Math.PI * r;
        const offset = circ - (score / 100) * circ;

        let col = '#10B981'; // green
        let lbl = 'Strong Human Indicators';

        if (score <= 30) {
            col = '#EF4444';
            lbl = 'Strong AI Indicators';
        } else if (score <= 50) {
            col = '#F59E0B';
            lbl = 'Inconclusive';
        } else if (score <= 75) {
            col = '#3B82F6';
            lbl = 'Likely Human';
        }

        if (mimicryFlag) {
            col = '#F59E0B';
            lbl = 'Possible Adversarial Mimicry';
        }

        return { color: col, label: lbl, strokeOffset: offset, circumference: circ };
    }, [score, mimicryFlag]);

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative" style={{ width: size, height: size }}>
                <svg
                    viewBox="0 0 100 100"
                    className="transform -rotate-90"
                    style={{ width: size, height: size }}
                >
                    {/* Background ring */}
                    <circle
                        cx="50" cy="50" r="45"
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth="8"
                    />
                    {/* Confidence interval band */}
                    <circle
                        cx="50" cy="50" r="45"
                        fill="none"
                        stroke={color}
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference - (confidenceHigh / 100) * circumference}
                        strokeLinecap="round"
                        opacity="0.15"
                    />
                    {/* Score ring */}
                    <circle
                        cx="50" cy="50" r="45"
                        fill="none"
                        stroke={color}
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeOffset}
                        strokeLinecap="round"
                        className="gauge-ring"
                    />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-900">{score}</span>
                    <span className="text-xs text-slate-500 font-medium">/ 100</span>
                </div>
            </div>
            <div className="text-center">
                <p className="text-sm font-semibold" style={{ color }}>{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                    95% CI: {confidenceLow}–{confidenceHigh}
                </p>
                {mimicryFlag && (
                    <div className="mt-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-md">
                        <p className="text-xs font-medium text-amber-800">
                            ⚠ Low Confidence — Possible Mimicry Detected
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
