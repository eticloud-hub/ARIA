import { Router, Request, Response } from 'express';
import { requireWriteAccess } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { emitAuditEvent } from '../../middleware/audit';
import { startAnalysisSchema } from './analysis.schemas';
import { sendSuccess, sendCreated } from '../../shared/envelope';
import { param } from '../../shared/params';
import type { Container } from '../../container';

export function createAnalysisRouter(container: Container): Router {
    const router = Router({ mergeParams: true });
    const { analysisService } = container;
    const { authenticate } = container.authMiddleware;

    router.use(authenticate);

    router.post(
        '/start',
        requireWriteAccess,
        validate({ body: startAnalysisSchema }),
        async (req: Request, res: Response) => {
            const job = await analysisService.startAnalysis(
                req.ctx.user.organisationId,
                param(req.params.id),
                req.ctx.user.id,
                req.body.priority
            );

            await emitAuditEvent(req, 'ANALYSIS_STARTED', 'analysis_job', job.id, {
                case_id: param(req.params.id),
            });

            sendCreated(res, job);
        }
    );

    router.get('/status', async (req: Request, res: Response) => {
        const status = await analysisService.getStatus(
            req.ctx.user.organisationId,
            param(req.params.id)
        );
        sendSuccess(res, status);
    });

    router.get('/result', async (req: Request, res: Response) => {
        const result = await analysisService.getResult(
            req.ctx.user.organisationId,
            param(req.params.id)
        );
        sendSuccess(res, result);
    });

    return router;
}
