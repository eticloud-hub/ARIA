import { v4 as uuidv4 } from 'uuid';
import { CaseNotAnalyzableError, AnalysisAlreadyRunningError } from '../../shared/errors';
import type { AnalysisRepository } from './analysis.repository';
import type { AnalysisJob, AnalysisResult } from '../../shared/types';

/**
 * AnalysisService — Business logic only.
 * Transactional outbox pattern via AnalysisRepository.
 */
export class AnalysisService {
    constructor(private readonly analysisRepo: AnalysisRepository) { }

    async startAnalysis(
        organisationId: string,
        caseId: string,
        userId: string,
        priority: 'standard' | 'urgent' = 'standard'
    ): Promise<AnalysisJob> {
        const existingJobs = await this.analysisRepo.findRunningJobs(caseId);
        if (existingJobs.length > 0) throw new AnalysisAlreadyRunningError();

        const artifacts = await this.analysisRepo.findValidArtifacts(caseId, organisationId);
        if (artifacts.length === 0) throw new CaseNotAnalyzableError();

        const jobId = uuidv4();
        const artifactKeys = artifacts.map((a) => a.s3_key);

        // Transaction wrapping happens inside the repository
        return this.analysisRepo.transaction(async (client) => {
            return this.analysisRepo.createJobWithOutbox(
                client, jobId, caseId, organisationId, userId, artifactKeys, priority
            );
        });
    }

    async getStatus(organisationId: string, caseId: string): Promise<AnalysisJob | null> {
        return this.analysisRepo.getLatestJob(caseId, organisationId);
    }

    async getResult(organisationId: string, caseId: string): Promise<AnalysisResult | null> {
        return this.analysisRepo.getLatestResult(caseId, organisationId);
    }
}
