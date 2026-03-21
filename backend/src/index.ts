import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './utils/logger';
import { requestLogger } from './middleware/requestLogger';
import http from 'http';

import { getConfig } from './config';
import { shutdownPool, testDbConnection } from './db/pool';
import { runMigrations } from './db/migrate';
import { errorHandler } from './middleware/errorHandler';
import { createContainer } from './container';
import { createCasesRouter } from './modules/cases/cases.router';
import { createArtifactsRouter } from './modules/artifacts/artifacts.router';
import { createAnalysisRouter } from './modules/analysis/analysis.router';
import { createReportsRouter } from './modules/reports/reports.router';
import { createAnnotationsRouter } from './modules/annotations/annotations.router';
import { createAdminRouter } from './modules/admin/admin.router';
import { createTusRouter } from './modules/artifacts/tus.router';

// ============================================================================
// COMPOSITION ROOT
// Wire the entire dependency graph once. No `new` anywhere else.
// ============================================================================
const container = createContainer();
const app = express();
const config = getConfig();

// ============================================================================
// Security Middleware (per TRD §07)
// ============================================================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
}));

app.use(cors({
    origin: config.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ============================================================================
// Health Check (unauthenticated)
// ============================================================================
app.get('/api/v1/health', (_req, res) => {
    res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
    });
});

app.get('/api/v1/config', (_req, res) => {
    res.json({
        supabaseUrl: config.SUPABASE_URL,
        supabaseAnonKey: config.SUPABASE_ANON_KEY,
    });
});

// ============================================================================
// API Routes — each router factory receives its dependencies from the container
// ============================================================================
app.use('/api/v1/cases', createCasesRouter(container));
app.use('/api/v1/cases/:id/artifacts', createArtifactsRouter(container));
app.use('/api/v1/cases/:id/analysis', createAnalysisRouter(container));
app.use('/api/v1/cases/:id/reports', createReportsRouter(container));
app.use('/api/v1/reports/:id/annotations', createAnnotationsRouter(container));
app.use('/api/v1/admin', createAdminRouter(container));
app.use('/api/v1/tus', createTusRouter(container));

// ============================================================================
// Error Handler (must be last)
// ============================================================================
app.use(errorHandler);

// ============================================================================
// Server Startup + Graceful Shutdown
// ============================================================================
const PORT = config.PORT;
const server = http.createServer(app);

// Guarantee DB is migrated before accepting any HTTP traffic
runMigrations()
    .then(async () => {
        await testDbConnection();
    })
    .catch((err) => {
        if (config.NODE_ENV === 'production') {
            logger.fatal({ err }, 'Failed to apply migrations at startup. Exiting.');
            process.exit(1);
        }
        logger.warn({ err }, 'Migration failed — continuing in development mode without migrations.');
    })
    .finally(() => {
        server.listen(PORT, () => {
            logger.info(
                { port: PORT, env: config.NODE_ENV, dbPoolSize: config.DB_POOL_SIZE },
                '🚀 ARIA API Gateway started'
            );

            // Start Transactional Outbox poller
            container.outboxService.start(2000);
        });
    });

// ============================================================================
// Graceful Shutdown — drain connections, stop pollers, close server
//
// Why this matters at 100x:
//   - Rolling ECS Fargate deploys send SIGTERM before killing containers
//   - Without this, in-flight requests are dropped, DB connections leak,
//     and the outbox may dispatch without marking as dispatched (→ duplicates)
// ============================================================================
async function gracefulShutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Received shutdown signal — initiating graceful shutdown');

    // 1. Stop accepting new connections
    server.close(() => {
        logger.info('HTTP server closed');
    });

    // 2. Stop outbox poller (no new dispatches)
    container.outboxService.stop();

    // 3. Wait for in-flight requests to drain (10s timeout)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 4. Drain DB connection pool
    await shutdownPool();

    logger.info('Graceful shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
