import { BaseRepository } from '../../repositories/BaseRepository';
import type { Report, AnalysisResult } from '../../shared/types';
import { NotFoundError } from '../../shared/errors';
import type { PoolClient } from 'pg';

/**
 * ReportRepository — All report SQL.
 */
export class ReportRepository extends BaseRepository {

    async findAnalysisResult(id: string, caseId: string, organisationId: string): Promise<AnalysisResult | null> {
        const { rows } = await this.query<AnalysisResult>(
            `SELECT * FROM analysis_results WHERE id = $1 AND case_id = $2 AND organisation_id = $3`,
            [id, caseId, organisationId]
        );
        return rows[0] ?? null;
    }

    async getNextVersion(caseId: string): Promise<number> {
        const { rows } = await this.query<{ max_version: number }>(
            `SELECT COALESCE(MAX(version), 0) as max_version FROM reports WHERE case_id = $1`,
            [caseId]
        );
        return (rows[0]?.max_version || 0) + 1;
    }

    /**
     * Atomic report creation + PDF outbox entry.
     */
    async createReportWithOutbox(
        client: PoolClient,
        reportId: string,
        caseId: string,
        organisationId: string,
        analysisResultId: string,
        version: number,
        s3Key: string,
        sha256Hash: string,
        userId: string
    ): Promise<Report> {
        const { rows } = await this.queryWithClient<Report>(client,
            `INSERT INTO reports (id, case_id, organisation_id, analysis_result_id, version, s3_key, sha256_hash, generated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [reportId, caseId, organisationId, analysisResultId, version, s3Key, sha256Hash, userId]
        );

        await this.queryWithClient(client,
            `INSERT INTO pending_jobs (job_type, payload, status)
             VALUES ('pdf_generation', $1, 'pending')`,
            [JSON.stringify({ reportId, caseId, analysisResultId, generatedBy: userId, s3Key, version })]
        );

        return rows[0]!;
    }

    async listByCase(caseId: string, organisationId: string): Promise<Report[]> {
        const { rows } = await this.query<Report>(
            `SELECT * FROM reports WHERE case_id = $1 AND organisation_id = $2 ORDER BY version DESC`,
            [caseId, organisationId]
        );
        return rows;
    }

    async findByIdAndOrg(reportId: string, organisationId: string): Promise<Report | null> {
        const { rows } = await this.query<Report>(
            `SELECT * FROM reports WHERE id = $1 AND organisation_id = $2`,
            [reportId, organisationId]
        );
        return rows[0] ?? null;
    }

    async findAnalysisResultById(id: string): Promise<AnalysisResult | null> {
        const { rows } = await this.query<AnalysisResult>(
            `SELECT * FROM analysis_results WHERE id = $1`,
            [id]
        );
        return rows[0] ?? null;
    }
}
