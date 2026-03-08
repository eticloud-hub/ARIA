import { v4 as uuidv4 } from 'uuid';
import { CaseNotAnalyzableError, AnalysisAlreadyRunningError } from '../../shared/errors';
import type { AnalysisRepository } from './analysis.repository';
import type { CachePort } from '../../ports/cache.port';
import type { AnalysisJob, AnalysisResult } from '../../shared/types';

/**
 * AnalysisService — Business logic only.
 * Transactional outbox pattern via AnalysisRepository.
 */
export class AnalysisService {
    constructor(
        private readonly analysisRepo: AnalysisRepository,
        private readonly cache: CachePort
    ) { }

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
        const cacheKey = `aria:case:${caseId}:status`;

        // 1. Try cache (Circuit breaker in CachePort means this won't throw if Redis is down)
        const cached = await this.cache.get<AnalysisJob>(cacheKey);
        if (cached) return cached;

        // 2. Cache miss: DB read
        const job = await this.analysisRepo.getLatestJob(caseId, organisationId);

        // 3. Populate cache behind the scenes (5s polling interval -> 5s TTL)
        if (job) {
            await this.cache.set(cacheKey, job, 5);
        }

        return job;
    }

    async getResult(organisationId: string, caseId: string): Promise<AnalysisResult | null> {
        return this.analysisRepo.getLatestResult(caseId, organisationId);
    }
}
