import { S3StorageAdapter } from './adapters/s3.storage';
import { RedisQueueAdapter } from './adapters/redis.queue';
import { RedisCacheAdapter } from './adapters/redis.cache';
import { CaseRepository } from './repositories/CaseRepository';
import { ArtifactRepository } from './modules/artifacts/artifact.repository';
import { AnalysisRepository } from './modules/analysis/analysis.repository';
import { ReportRepository } from './modules/reports/report.repository';
import { AnnotationRepository } from './modules/annotations/annotation.repository';
import { AdminRepository } from './modules/admin/admin.repository';
import { CasesService } from './modules/cases/cases.service';
import { ArtifactsService } from './modules/artifacts/artifacts.service';
import { AnalysisService } from './modules/analysis/analysis.service';
import { ReportsService } from './modules/reports/reports.service';
import { AnnotationsService } from './modules/annotations/annotations.service';
import { AdminService } from './modules/admin/admin.service';
import { OutboxService } from './services/outbox.service';
import { createAuthMiddleware, type AuthMiddleware } from './middleware/auth';
import type { StoragePort } from './ports/storage.port';
import type { QueuePort } from './ports/queue.port';
import type { CachePort } from './ports/cache.port';

/**
 * Dependency Injection Container — Composition Root
 *
 * This is the ONLY place in the codebase where concrete classes are instantiated.
 * Every service receives its dependencies via constructor injection.
 *
 * Dependency graph:
 *   Ports → Repositories → Sub-services → Services → Routers
 */
export interface Container {
    // Ports
    storage: StoragePort;
    queue: QueuePort;
    cache: CachePort;

    // Repositories
    caseRepository: CaseRepository;
    artifactRepository: ArtifactRepository;
    analysisRepository: AnalysisRepository;
    reportRepository: ReportRepository;
    annotationRepository: AnnotationRepository;
    adminRepository: AdminRepository;

    // Services
    casesService: CasesService;
    artifactsService: ArtifactsService;
    analysisService: AnalysisService;
    reportsService: ReportsService;
    annotationsService: AnnotationsService;
    adminService: AdminService;

    // Infrastructure
    outboxService: OutboxService;

    // Middleware (DI-injected, not module-level singletons)
    authMiddleware: AuthMiddleware;
}

export function createContainer(): Container {
    // --- Layer 0: Ports ---
    const storage: StoragePort = new S3StorageAdapter();
    const queue: QueuePort = new RedisQueueAdapter();
    const cache: CachePort = new RedisCacheAdapter();

    // --- Layer 1: Repositories ---
    const caseRepository = new CaseRepository();
    const artifactRepository = new ArtifactRepository();
    const analysisRepository = new AnalysisRepository();
    const reportRepository = new ReportRepository();
    const annotationRepository = new AnnotationRepository();
    const adminRepository = new AdminRepository();

    // --- Layer 3: Services ---
    const casesService = new CasesService(caseRepository);
    const artifactsService = new ArtifactsService(storage, artifactRepository);
    const analysisService = new AnalysisService(analysisRepository, cache);
    const reportsService = new ReportsService(storage, reportRepository);
    const annotationsService = new AnnotationsService(annotationRepository);
    const adminService = new AdminService(adminRepository);

    // --- Layer 4: Infrastructure ---
    const outboxService = new OutboxService(queue);

    // --- Layer 5: Middleware ---
    // Injecting dependencies for verify Supabase JWTs. We might need adminRepository to fetch user context
    const authMiddleware = createAuthMiddleware(adminRepository);

    return {
        storage, queue, cache,
        caseRepository, artifactRepository,
        analysisRepository, reportRepository, annotationRepository, adminRepository,
        casesService, artifactsService,
        analysisService, reportsService, annotationsService, adminService,
        outboxService,
        authMiddleware,
    };
}
