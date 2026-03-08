/**
 * Anti-Corruption Layer — Data Adapters
 * Per TRD §03: UI components never access API types directly.
 * These adapters transform API responses into UI-safe DTOs.
 */

// --- API Types (what comes from the server) ---
interface ApiCase {
    id: string;
    reference_id: string;
    title: string;
    description: string | null;
    status: string;
    created_by: string;
    organisation_id: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

interface ApiArtifact {
    id: string;
    case_id: string;
    filename: string;
    s3_key: string;
    file_format: string;
    file_size_bytes: number;
    sha256_hash: string;
    ingest_status: string;
    ingest_error: string | null;
    uploaded_by: string;
    uploaded_at: string;
}

interface ApiAnalysisResult {
    id: string;
    job_id: string;
    case_id: string;
    human_attribution_score: number;
    confidence_interval_low: number;
    confidence_interval_high: number;
    mimicry_flag: boolean;
    dimension_scores: Array<{
        dimension: string;
        score: number;
        confidence: number;
        evidence: Array<{
            type: string;
            severity: string;
            timestamp_offset_ms: number;
            description: string;
        }>;
    }>;
    insufficient_data_dimensions: string[];
    agent_profile_notes: string | null;
    executive_summary: string | null;
    created_at: string;
}

// --- UI DTOs (what components consume) ---
export interface CaseDto {
    id: string;
    referenceId: string;
    title: string;
    description: string;
    status: 'draft' | 'ingesting' | 'queued' | 'analysing' | 'complete' | 'error';
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
}

export interface ArtifactDto {
    id: string;
    caseId: string;
    filename: string;
    format: string;
    sizeBytes: number;
    hash: string;
    status: 'pending' | 'uploading' | 'valid' | 'error';
    error: string | null;
    uploadedAt: Date;
}

export interface AnalysisResultDto {
    id: string;
    jobId: string;
    caseId: string;
    score: number;
    confidenceLow: number;
    confidenceHigh: number;
    mimicryFlag: boolean;
    dimensions: DimensionDto[];
    insufficientDimensions: string[];
    agentProfileNotes: string | null;
    executiveSummary: string | null;
    createdAt: Date;
}

export interface EvidenceDto {
    type: string;
    severity: string;
    timestampOffsetMs: number;
    description: string;
}

export interface DimensionDto {
    name: string;
    displayName: string;
    score: number;
    confidence: number;
    evidenceCount: number;
    evidence: EvidenceDto[];
}

// --- Adapters ---
const DIMENSION_DISPLAY_NAMES: Record<string, string> = {
    decision_pattern: 'Decision Pattern Analysis',
    performance_consistency: 'Performance Consistency',
    error_rate: 'Error Rate & Type',
    behavioral_inertia: 'Behavioral Inertia',
    cognitive_bias: 'Cognitive Bias Markers',
};

export function adaptCase(api: ApiCase): CaseDto {
    return {
        id: api.id,
        referenceId: api.reference_id,
        title: api.title,
        description: api.description || '',
        status: api.status as CaseDto['status'],
        createdAt: new Date(api.created_at),
        updatedAt: new Date(api.updated_at),
        completedAt: api.completed_at ? new Date(api.completed_at) : null,
    };
}

export function adaptArtifact(api: ApiArtifact): ArtifactDto {
    return {
        id: api.id,
        caseId: api.case_id,
        filename: api.filename,
        format: api.file_format,
        sizeBytes: api.file_size_bytes,
        hash: api.sha256_hash,
        status: api.ingest_status as ArtifactDto['status'],
        error: api.ingest_error,
        uploadedAt: new Date(api.uploaded_at),
    };
}

export function adaptAnalysisResult(api: ApiAnalysisResult): AnalysisResultDto {
    return {
        id: api.id,
        jobId: api.job_id,
        caseId: api.case_id,
        score: api.human_attribution_score,
        confidenceLow: api.confidence_interval_low,
        confidenceHigh: api.confidence_interval_high,
        mimicryFlag: api.mimicry_flag,
        dimensions: api.dimension_scores.map((d) => ({
            name: d.dimension,
            displayName: DIMENSION_DISPLAY_NAMES[d.dimension] || d.dimension,
            score: d.score,
            confidence: d.confidence,
            evidenceCount: d.evidence.length,
            evidence: d.evidence.map((e) => ({
                type: e.type,
                severity: e.severity,
                timestampOffsetMs: e.timestamp_offset_ms,
                description: e.description,
            })),
        })),
        insufficientDimensions: api.insufficient_data_dimensions,
        agentProfileNotes: api.agent_profile_notes,
        executiveSummary: api.executive_summary,
        createdAt: new Date(api.created_at),
    };
}
