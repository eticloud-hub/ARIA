// ============================================================================
// ARIA — Shared Types (Backend)
// All types aligned with TRD §05 Schema + §06 API Structure
// ============================================================================

// --- Enums ---
export type UserRole = 'admin' | 'investigator' | 'reviewer';
export type CaseStatus = 'draft' | 'ingesting' | 'queued' | 'analysing' | 'complete' | 'error';
export type IngestStatus = 'pending' | 'uploading' | 'valid' | 'error';
export type JobStatus = 'queued' | 'running' | 'complete' | 'failed';
export type FileFormat = 'evtx' | 'pcap' | 'csv' | 'json';
export type AuditEventType =
    | 'CASE_CREATED' | 'CASE_UPDATED' | 'CASE_DELETED'
    | 'ARTIFACT_UPLOADED' | 'ARTIFACT_CONFIRMED' | 'ARTIFACT_DELETED'
    | 'ANALYSIS_STARTED' | 'ANALYSIS_COMPLETED' | 'ANALYSIS_FAILED'
    | 'REPORT_GENERATED' | 'REPORT_EXPORTED' | 'REPORT_DOWNLOADED'
    | 'ANNOTATION_CREATED' | 'ANNOTATION_UPDATED' | 'ANNOTATION_DELETED'
    | 'USER_CREATED' | 'USER_UPDATED' | 'USER_LOGIN' | 'USER_LOGOUT'
    | 'MFA_SETUP' | 'MFA_VERIFIED';

// --- Database Row Types ---
export interface Organisation {
    id: string;
    name: string;
    slug: string;
    data_residency_region: string | null;
    max_storage_bytes: number;
    created_at: Date;
    updated_at: Date;
}

export interface User {
    id: string;
    organisation_id: string;
    email: string;
    password_hash: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
    mfa_secret: string | null;
    mfa_enabled: boolean;
    mfa_backup_codes: string[] | null;
    mfa_salt: string | null;
    token_version: number;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface Case {
    id: string;
    organisation_id: string;
    reference_id: string;
    title: string;
    description: string | null;
    status: CaseStatus;
    created_by: string;
    metadata: Record<string, unknown> | null;
    created_at: Date;
    updated_at: Date;
    completed_at: Date | null;
    deleted_at: Date | null;
}

export interface Artifact {
    id: string;
    case_id: string;
    organisation_id: string;
    filename: string;
    s3_key: string;
    file_format: FileFormat;
    file_size_bytes: number;
    sha256_hash: string;
    ingest_status: IngestStatus;
    ingest_error: string | null;
    uploaded_by: string;
    uploaded_at: Date;
}

export interface AnalysisJob {
    id: string;
    case_id: string;
    organisation_id: string;
    status: JobStatus;
    engine_version: string | null;
    engine_git_sha: string | null;
    queued_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
    error_message: string | null;
    worker_id: string | null;
    created_by: string;
}

export interface DimensionScore {
    dimension: string;
    score: number;         // 0-100
    confidence: number;    // 0.0-1.0
    evidence: EvidenceItem[];
}

export interface EvidenceItem {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp_offset_ms: number;
    description: string;
}

export interface AnalysisResult {
    id: string;
    job_id: string;
    case_id: string;
    organisation_id: string;
    human_attribution_score: number;
    confidence_interval_low: number;
    confidence_interval_high: number;
    mimicry_flag: boolean;
    dimension_scores: DimensionScore[];
    insufficient_data_dimensions: string[];
    agent_profile_notes: string | null;
    session_breakdown: Record<string, unknown> | null;
    engine_manifest: Record<string, unknown> | null;
    executive_summary: string | null;
    created_at: Date;
}

export interface Report {
    id: string;
    case_id: string;
    organisation_id: string;
    analysis_result_id: string;
    version: number;
    s3_key: string;
    sha256_hash: string;
    generated_by: string;
    generated_at: Date;
    is_locked: boolean;
}

export interface ReportAnnotation {
    id: string;
    report_id: string;
    organisation_id: string;
    section_key: string;
    body: string;
    created_by: string;
    created_at: Date;
    updated_at: Date;
}

export interface AuditEvent {
    id: string;
    organisation_id: string | null;
    actor_id: string | null;
    event_type: string;
    entity_type: string;
    entity_id: string;
    payload: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: Date;
}

// --- API Envelope ---
export interface ApiEnvelope<T> {
    data: T | null;
    meta: {
        request_id: string;
        timestamp: string;
        pagination?: {
            cursor: string | null;
            has_more: boolean;
            total?: number;
        };
    };
    error: ApiError | null;
}

export interface ApiError {
    code: string;
    message: string;
    field?: string;
    request_id: string;
}

// --- JWT Payload (Supabase Standard) ---
export interface JwtPayload {
    sub: string;           // Supabase user ID UUID
    aal?: string;          // Assurance Level (e.g. "aal1" or "aal2")
    email?: string;
    exp: number;
    iat: number;
}

// --- Request Context (attached by middleware) ---
export interface RequestContext {
    user: {
        id: string;
        organisationId: string;
        role: UserRole;
        mfaVerified: boolean;
    };
    requestId: string;
    ipAddress: string;
}
