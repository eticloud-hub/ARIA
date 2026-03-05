/**
 * Port: Analysis Job Queue
 * Decouples the API gateway from the Python worker via message bus.
 * Per TRD scalability safeguards — never call workers directly.
 */
export interface AnalysisJobPayload {
    jobId: string;
    caseId: string;
    organisationId: string;
    artifactKeys: string[];
    triggeredBy: string;
    priority: 'standard' | 'urgent';
    enqueuedAt: string;
}

export interface QueuePort {
    /** Enqueue an analysis job */
    enqueueAnalysis(payload: AnalysisJobPayload): Promise<string>;

    /** Enqueue a PDF generation job */
    enqueuePdfGeneration(payload: {
        reportId: string;
        caseId: string;
        analysisResultId: string;
        generatedBy: string;
    }): Promise<string>;

    /** Get job status from the queue */
    getJobStatus(jobId: string): Promise<{
        status: 'waiting' | 'active' | 'completed' | 'failed';
        progress?: number;
    } | null>;
}
