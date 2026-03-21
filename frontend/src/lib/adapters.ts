import { z } from 'zod';

/**
 * Anti-Corruption Layer — Data Adapters
 * Per TRD §03: UI components never access API types directly.
 * These adapters transform API responses into UI-safe DTOs using strict Zod parsing.
 */

// --- Zod Boundary Schemas ---
export const CaseDtoSchema = z.object({
    id: z.string().uuid(),
    referenceId: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['draft', 'ingesting', 'queued', 'analysing', 'complete', 'error']),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    completedAt: z.coerce.date().nullable(),
});

export const ArtifactDtoSchema = z.object({
    id: z.string().uuid(),
    caseId: z.string().uuid(),
    filename: z.string(),
    format: z.string(),
    sizeBytes: z.number(),
    hash: z.string(),
    status: z.enum(['pending', 'uploading', 'valid', 'error']),
    error: z.string().nullable(),
    uploadedAt: z.coerce.date(),
});

export const EvidenceDtoSchema = z.object({
    type: z.string(),
    severity: z.string(),
    timestampOffsetMs: z.number(),
    description: z.string(),
});

export const DimensionDtoSchema = z.object({
    name: z.string(),
    displayName: z.string(),
    score: z.number(),
    confidence: z.number(),
    evidenceCount: z.number(),
    evidence: z.array(EvidenceDtoSchema),
});

export const AnalysisResultDtoSchema = z.object({
    id: z.string().uuid(),
    jobId: z.string().uuid(),
    caseId: z.string().uuid(),
    score: z.number(),
    confidenceLow: z.number(),
    confidenceHigh: z.number(),
    mimicryFlag: z.boolean(),
    dimensions: z.array(DimensionDtoSchema),
    insufficientDimensions: z.array(z.string()),
    agentProfileNotes: z.string().nullable(),
    executiveSummary: z.string().nullable(),
    createdAt: z.coerce.date(),
});

// --- Inferred Types ---
export type CaseDto = z.infer<typeof CaseDtoSchema>;
export type ArtifactDto = z.infer<typeof ArtifactDtoSchema>;
export type AnalysisResultDto = z.infer<typeof AnalysisResultDtoSchema>;
export type EvidenceDto = z.infer<typeof EvidenceDtoSchema>;
export type DimensionDto = z.infer<typeof DimensionDtoSchema>;

// --- Adapters ---
const DIMENSION_DISPLAY_NAMES: Record<string, string> = {
    decision_pattern: 'Decision Pattern Analysis',
    performance_consistency: 'Performance Consistency',
    error_rate: 'Error Rate & Type',
    behavioral_inertia: 'Behavioral Inertia',
    cognitive_bias: 'Cognitive Bias Markers',
};

export function adaptCase(api: any): CaseDto {
    return CaseDtoSchema.parse({
        id: api.id,
        referenceId: api.reference_id,
        title: api.title,
        description: api.description || '',
        status: api.status,
        createdAt: api.created_at,
        updatedAt: api.updated_at,
        completedAt: api.completed_at || null,
    });
}

export function adaptArtifact(api: any): ArtifactDto {
    return ArtifactDtoSchema.parse({
        id: api.id,
        caseId: api.case_id,
        filename: api.filename,
        format: api.file_format,
        sizeBytes: api.file_size_bytes,
        hash: api.sha256_hash,
        status: api.ingest_status,
        error: api.ingest_error,
        uploadedAt: api.uploaded_at,
    });
}

export function adaptAnalysisResult(api: any): AnalysisResultDto {
    return AnalysisResultDtoSchema.parse({
        id: api.id,
        jobId: api.job_id,
        caseId: api.case_id,
        score: api.human_attribution_score,
        confidenceLow: api.confidence_interval_low,
        confidenceHigh: api.confidence_interval_high,
        mimicryFlag: api.mimicry_flag,
        dimensions: api.dimension_scores.map((d: any) => ({
            name: d.dimension,
            displayName: DIMENSION_DISPLAY_NAMES[d.dimension] || d.dimension,
            score: d.score,
            confidence: d.confidence,
            evidenceCount: d.evidence?.length || 0,
            evidence: (d.evidence || []).map((e: any) => ({
                type: e.type,
                severity: e.severity,
                timestampOffsetMs: e.timestamp_offset_ms,
                description: e.description,
            })),
        })),
        insufficientDimensions: api.insufficient_data_dimensions,
        agentProfileNotes: api.agent_profile_notes,
        executiveSummary: api.executive_summary,
        createdAt: api.created_at,
    });
}
