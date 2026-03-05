import { S3StorageAdapter } from './adapters/s3.storage';
import { RedisQueueAdapter } from './adapters/redis.queue';
import { CaseRepository } from './repositories/CaseRepository';
import { AuthRepository } from './modules/auth/auth.repository';
import { ArtifactRepository } from './modules/artifacts/artifact.repository';
import { AnalysisRepository } from './modules/analysis/analysis.repository';
import { ReportRepository } from './modules/reports/report.repository';
import { AnnotationRepository } from './modules/annotations/annotation.repository';
import { AdminRepository } from './modules/admin/admin.repository';
import { TokenService } from './modules/auth/token.service';
import { MfaService } from './modules/auth/mfa.service';
import { CasesService } from './modules/cases/cases.service';
import { AuthService } from './modules/auth/auth.service';
import { ArtifactsService } from './modules/artifacts/artifacts.service';
import { AnalysisService } from './modules/analysis/analysis.service';
import { ReportsService } from './modules/reports/reports.service';
import { AnnotationsService } from './modules/annotations/annotations.service';
import { AdminService } from './modules/admin/admin.service';
import { OutboxService } from './services/outbox.service';
import { createAuthMiddleware, type AuthMiddleware } from './middleware/auth';
import type { StoragePort } from './ports/storage.port';
import type { QueuePort } from './ports/queue.port';

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

    // Repositories
    caseRepository: CaseRepository;
    authRepository: AuthRepository;
    artifactRepository: ArtifactRepository;
    analysisRepository: AnalysisRepository;
    reportRepository: ReportRepository;
    annotationRepository: AnnotationRepository;
    adminRepository: AdminRepository;

    // Auth sub-services
    tokenService: TokenService;
    mfaService: MfaService;

    // Services
    casesService: CasesService;
    authService: AuthService;
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

    // --- Layer 1: Repositories ---
    const caseRepository = new CaseRepository();
    const authRepository = new AuthRepository();
    const artifactRepository = new ArtifactRepository();
    const analysisRepository = new AnalysisRepository();
    const reportRepository = new ReportRepository();
    const annotationRepository = new AnnotationRepository();
    const adminRepository = new AdminRepository();

    // --- Layer 2: Auth sub-services ---
    const tokenService = new TokenService(authRepository);
    const mfaService = new MfaService(authRepository, tokenService);

    // --- Layer 3: Services ---
    const casesService = new CasesService(caseRepository);
    const authService = new AuthService(authRepository, tokenService, mfaService);
    const artifactsService = new ArtifactsService(storage, artifactRepository);
    const analysisService = new AnalysisService(analysisRepository);
    const reportsService = new ReportsService(storage, reportRepository);
    const annotationsService = new AnnotationsService(annotationRepository);
    const adminService = new AdminService(adminRepository);

    // --- Layer 4: Infrastructure ---
    const outboxService = new OutboxService(queue);

    // --- Layer 5: Middleware ---
    const authMiddleware = createAuthMiddleware(authRepository);

    return {
        storage, queue,
        caseRepository, authRepository, artifactRepository,
        analysisRepository, reportRepository, annotationRepository, adminRepository,
        tokenService, mfaService,
        casesService, authService, artifactsService,
        analysisService, reportsService, annotationsService, adminService,
        outboxService,
        authMiddleware,
    };
}
