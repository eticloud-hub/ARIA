import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getConfig } from '../../config';
import { NotFoundError } from '../../shared/errors';
import type { StoragePort } from '../../ports/storage.port';
import type { ReportRepository } from './report.repository';
import type { Report, AnalysisResult } from '../../shared/types';

/**
 * ReportsService — Business logic only.
 * SQL delegated to ReportRepository, storage to StoragePort.
 */
export class ReportsService {
    constructor(
        private readonly storage: StoragePort,
        private readonly reportRepo: ReportRepository
    ) { }

    async generate(
        organisationId: string,
        caseId: string,
        analysisResultId: string,
        userId: string
    ): Promise<Report> {
        const result = await this.reportRepo.findAnalysisResult(analysisResultId, caseId, organisationId);
        if (!result) throw new NotFoundError('Analysis Result');

        const nextVersion = await this.reportRepo.getNextVersion(caseId);
        const reportId = uuidv4();
        const s3Key = `${organisationId}/${caseId}/reports/${reportId}.pdf`;

        const placeholderHash = crypto.createHash('sha256')
            .update(`${reportId}:${new Date().toISOString()}`)
            .digest('hex');

        return this.reportRepo.transaction(async (client) => {
            return this.reportRepo.createReportWithOutbox(
                client, reportId, caseId, organisationId, analysisResultId,
                nextVersion, s3Key, placeholderHash, userId
            );
        });
    }

    async listByCase(organisationId: string, caseId: string): Promise<Report[]> {
        return this.reportRepo.listByCase(caseId, organisationId);
    }

    async getById(organisationId: string, reportId: string): Promise<Report> {
        const report = await this.reportRepo.findByIdAndOrg(reportId, organisationId);
        if (!report) throw new NotFoundError('Report');
        return report;
    }

    async getDownloadUrl(organisationId: string, reportId: string): Promise<string> {
        const report = await this.getById(organisationId, reportId);
        const config = getConfig();
        return this.storage.generateDownloadUrl(config.S3_REPORTS_BUCKET, report.s3_key, config.S3_PRESIGNED_URL_TTL);
    }

    async exportJson(
        organisationId: string,
        caseId: string,
        reportId: string
    ): Promise<{ report: Report; analysisResult: AnalysisResult }> {
        const report = await this.getById(organisationId, reportId);
        const analysisResult = await this.reportRepo.findAnalysisResultById(report.analysis_result_id);
        if (!analysisResult) throw new NotFoundError('Analysis Result');
        return { report, analysisResult };
    }
}
