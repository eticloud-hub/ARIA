import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, Upload, Play, FileText,
    Hash, Clock, FileType, CheckCircle, XCircle
} from 'lucide-react';
import { StatusBadge } from '../components/atoms/StatusBadge';
import { HABDGauge } from '../components/molecules/HABDGauge';
import { AnalysisChecklist, getDefaultAnalysisSteps } from '../components/molecules/AnalysisChecklist';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import api from '../lib/api';
import type { CaseDto, ArtifactDto, AnalysisResultDto } from '../lib/adapters';
import { adaptCase, adaptArtifact, adaptAnalysisResult } from '../lib/adapters';

/**
 * CaseDetailScreen — S-05 / S-06 / S-07
 * Case detail view: artifact manifest, analysis progress, and results.
 */
export const CaseDetailScreen: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuthStore();
    const { addToast } = useUiStore();
    const [caseData, setCaseData] = useState<CaseDto | null>(null);
    const [artifacts, setArtifacts] = useState<ArtifactDto[]>([]);
    const [result, setResult] = useState<AnalysisResultDto | null>(null);
    const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) loadAll();
    }, [id]);

    const loadAll = async () => {
        try {
            const [caseRes, artifactsRes, resultRes, statusRes] = await Promise.all([
                api.get(`/cases/${id}`),
                api.get(`/cases/${id}/artifacts`),
                api.get(`/cases/${id}/analysis/result`).catch(() => ({ data: { data: null } })),
                api.get(`/cases/${id}/analysis/status`).catch(() => ({ data: { data: null } })),
            ]);

            setCaseData(adaptCase(caseRes.data.data));
            setArtifacts((artifactsRes.data.data || []).map(adaptArtifact));
            if (resultRes.data.data) setResult(adaptAnalysisResult(resultRes.data.data));
            if (statusRes.data.data) setAnalysisStatus(statusRes.data.data.status);
        } catch {
            addToast({ type: 'error', title: 'Failed to load case data' });
        } finally {
            setLoading(false);
        }
    };

    const handleStartAnalysis = async () => {
        try {
            await api.post(`/cases/${id}/analysis/start`, { priority: 'standard' });
            addToast({ type: 'success', title: 'Analysis Started', message: 'HABD analysis has been queued.' });
            loadAll();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
            addToast({ type: 'error', title: 'Error', message: axiosErr.response?.data?.error?.message || 'Failed to start analysis.' });
        }
    };

    const handleGenerateReport = async () => {
        if (!result) return;
        try {
            await api.post(`/cases/${id}/reports`, { analysisResultId: result.id });
            addToast({ type: 'success', title: 'Report Queued', message: 'PDF report is being generated.' });
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
            addToast({ type: 'error', title: 'Error', message: axiosErr.response?.data?.error?.message || 'Failed.' });
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
        return `${(bytes / 1073741824).toFixed(2)} GB`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!caseData) return <p className="text-slate-500">Case not found.</p>;

    const isWriteUser = user?.role !== 'reviewer';
    const canStartAnalysis = isWriteUser && artifacts.some((a) => a.status === 'valid') && !['queued', 'analysing'].includes(caseData.status);

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link to="/" className="aria-btn-ghost p-2">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-slate-800">{caseData.title}</h1>
                        <StatusBadge status={caseData.status} />
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                        <span className="font-mono">{caseData.referenceId}</span>
                        {caseData.description && ` — ${caseData.description}`}
                    </p>
                </div>
                <div className="flex gap-2">
                    {canStartAnalysis && (
                        <button onClick={handleStartAnalysis} className="aria-btn-primary" id="start-analysis-btn">
                            <Play className="w-4 h-4" /> Start Analysis
                        </button>
                    )}
                    {result && isWriteUser && (
                        <button onClick={handleGenerateReport} className="aria-btn-secondary" id="generate-report-btn">
                            <FileText className="w-4 h-4" /> Generate Report
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Left: Artifacts + Analysis Progress */}
                <div className="col-span-2 space-y-6">
                    {/* Artifacts */}
                    <div className="aria-card">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100">
                            <h2 className="text-sm font-semibold text-slate-700">
                                Artifacts ({artifacts.length})
                            </h2>
                            {isWriteUser && caseData.status === 'draft' && (
                                <button className="aria-btn-secondary text-xs" id="upload-artifact-btn">
                                    <Upload className="w-3.5 h-3.5" /> Upload
                                </button>
                            )}
                        </div>
                        {artifacts.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Upload className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-sm">No artifacts uploaded yet.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {artifacts.map((a) => (
                                    <div key={a.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                                        <FileType className="w-8 h-8 text-slate-300 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-700 truncate">{a.filename}</p>
                                            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                                                <span>{a.format.toUpperCase()}</span>
                                                <span>{formatBytes(a.sizeBytes)}</span>
                                                <span className="font-mono truncate max-w-[160px]" title={a.hash}>
                                                    SHA-256: {a.hash.substring(0, 12)}...
                                                </span>
                                            </div>
                                        </div>
                                        <StatusBadge status={a.status} size="sm" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Analysis Result */}
                    {result && (
                        <div className="aria-card p-6">
                            <h2 className="text-sm font-semibold text-slate-700 mb-4">Analysis Result</h2>
                            <div className="grid grid-cols-2 gap-6">
                                {/* Score */}
                                <div className="flex justify-center">
                                    <HABDGauge
                                        score={result.score}
                                        confidenceLow={result.confidenceLow}
                                        confidenceHigh={result.confidenceHigh}
                                        mimicryFlag={result.mimicryFlag}
                                        size={180}
                                    />
                                </div>
                                {/* Dimensions */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Dimensional Scores
                                    </h3>
                                    {result.dimensions.map((dim) => (
                                        <div key={dim.name} className="space-y-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-600">{dim.displayName}</span>
                                                <span className="font-medium text-slate-800">{dim.score}/100</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-1000"
                                                    style={{
                                                        width: `${dim.score}%`,
                                                        backgroundColor: dim.score > 75 ? '#10B981' : dim.score > 50 ? '#3B82F6' : dim.score > 30 ? '#F59E0B' : '#EF4444',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {result.executiveSummary && (
                                <div className="mt-6 p-4 bg-slate-50 rounded-md border border-slate-100">
                                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                        Executive Summary
                                    </h3>
                                    <p className="text-sm text-slate-700 leading-relaxed">{result.executiveSummary}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right sidebar */}
                <div className="space-y-6">
                    {/* Case metadata */}
                    <div className="aria-card p-4">
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Case Details
                        </h2>
                        <dl className="space-y-3 text-sm">
                            <div>
                                <dt className="text-slate-400 text-xs">Reference ID</dt>
                                <dd className="font-mono text-navy-600">{caseData.referenceId}</dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 text-xs">Status</dt>
                                <dd><StatusBadge status={caseData.status} size="sm" /></dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 text-xs">Created</dt>
                                <dd className="text-slate-700">{caseData.createdAt.toLocaleDateString()}</dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 text-xs">Last Updated</dt>
                                <dd className="text-slate-700">{caseData.updatedAt.toLocaleDateString()}</dd>
                            </div>
                        </dl>
                    </div>

                    {/* Analysis checklist */}
                    <div className="aria-card p-4">
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Analysis Pipeline
                        </h2>
                        <AnalysisChecklist
                            steps={getDefaultAnalysisSteps(
                                analysisStatus === 'running' ? 'decision_pattern' :
                                    analysisStatus === 'complete' ? undefined : undefined
                            ).map((s) =>
                                analysisStatus === 'complete'
                                    ? { ...s, status: 'complete' as const }
                                    : s
                            )}
                        />
                    </div>

                    {/* Chain of custody */}
                    <div className="aria-card p-4">
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Chain of Custody
                        </h2>
                        <div className="space-y-2 text-xs">
                            {artifacts.filter((a) => a.status === 'valid').map((a) => (
                                <div key={a.id} className="flex items-start gap-2">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-slate-600">{a.filename}</p>
                                        <p className="font-mono text-slate-400 truncate" title={a.hash}>
                                            {a.hash.substring(0, 20)}...
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {artifacts.filter((a) => a.status === 'valid').length === 0 && (
                                <p className="text-slate-400">No verified artifacts.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
