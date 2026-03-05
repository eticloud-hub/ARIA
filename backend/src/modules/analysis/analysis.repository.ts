import { BaseRepository } from '../../repositories/BaseRepository';
import type { AnalysisJob, AnalysisResult, Artifact } from '../../shared/types';
import type { PoolClient } from 'pg';

/**
 * AnalysisRepository — All analysis SQL.
 * Includes transactional methods for the Outbox pattern.
 */
export class AnalysisRepository extends BaseRepository {

    async findRunningJobs(caseId: string): Promise<AnalysisJob[]> {
        const { rows } = await this.query<AnalysisJob>(
            `SELECT id FROM analysis_jobs WHERE case_id = $1 AND status IN ('queued', 'running')`,
            [caseId]
        );
        return rows;
    }

    async findValidArtifacts(caseId: string, organisationId: string): Promise<Artifact[]> {
        const { rows } = await this.query<Artifact>(
            `SELECT id, s3_key FROM artifacts WHERE case_id = $1 AND organisation_id = $2 AND ingest_status = 'valid'`,
            [caseId, organisationId]
        );
        return rows;
    }

    /**
     * Atomic job creation + outbox entry within a transaction.
     */
    async createJobWithOutbox(
        client: PoolClient,
        jobId: string,
        caseId: string,
        organisationId: string,
        userId: string,
        artifactKeys: string[],
        priority: string
    ): Promise<AnalysisJob> {
        const { rows } = await this.queryWithClient<AnalysisJob>(client,
            `INSERT INTO analysis_jobs (id, case_id, organisation_id, status, queued_at, created_by)
             VALUES ($1, $2, $3, 'queued', now(), $4)
             RETURNING *`,
            [jobId, caseId, organisationId, userId]
        );

        await this.queryWithClient(client,
            `INSERT INTO pending_jobs (job_type, payload, status)
             VALUES ('analysis', $1, 'pending')`,
            [JSON.stringify({
                jobId, caseId, organisationId,
                artifactKeys,
                triggeredBy: userId,
                priority,
                enqueuedAt: new Date().toISOString(),
            })]
        );

        await this.queryWithClient(client,
            `UPDATE cases SET status = 'queued' WHERE id = $1`,
            [caseId]
        );

        return rows[0]!;
    }

    async getLatestJob(caseId: string, organisationId: string): Promise<AnalysisJob | null> {
        const { rows } = await this.query<AnalysisJob>(
            `SELECT * FROM analysis_jobs WHERE case_id = $1 AND organisation_id = $2
             ORDER BY queued_at DESC LIMIT 1`,
            [caseId, organisationId]
        );
        return rows[0] ?? null;
    }

    async getLatestResult(caseId: string, organisationId: string): Promise<AnalysisResult | null> {
        const { rows } = await this.query<AnalysisResult>(
            `SELECT ar.* FROM analysis_results ar
             JOIN analysis_jobs aj ON ar.job_id = aj.id
             WHERE ar.case_id = $1 AND ar.organisation_id = $2
             ORDER BY ar.created_at DESC LIMIT 1`,
            [caseId, organisationId]
        );
        return rows[0] ?? null;
    }
}
