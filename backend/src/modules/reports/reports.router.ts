import { Router, Request, Response } from 'express';
import { requireWriteAccess } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { emitAuditEvent } from '../../middleware/audit';
import { aiRateLimiter } from '../../middleware/rateLimiter';
import { generateReportSchema } from './reports.schemas';
import { sendSuccess, sendCreated } from '../../shared/envelope';
import { param } from '../../shared/params';
import type { Container } from '../../container';

export function createReportsRouter(container: Container): Router {
    const router = Router({ mergeParams: true });
    const { reportsService } = container;
    const { authenticate } = container.authMiddleware;

    router.use(authenticate);

    router.post(
        '/',
        requireWriteAccess,
        aiRateLimiter,
        validate({ body: generateReportSchema }),
        async (req: Request, res: Response) => {
            const report = await reportsService.generate(
                req.ctx.user.organisationId,
                param(req.params.id),
                req.body.analysisResultId,
                req.ctx.user.id
            );

            await emitAuditEvent(req, 'REPORT_GENERATED', 'report', report.id, {
                case_id: param(req.params.id),
                version: report.version,
            });

            sendCreated(res, report);
        }
    );

    router.get('/', async (req: Request, res: Response) => {
        const reports = await reportsService.listByCase(
            req.ctx.user.organisationId,
            param(req.params.id)
        );
        sendSuccess(res, reports);
    });

    router.get('/:reportId', async (req: Request, res: Response) => {
        const report = await reportsService.getById(
            req.ctx.user.organisationId,
            param(req.params.reportId)
        );
        sendSuccess(res, report);
    });

    router.get('/:reportId/download', async (req: Request, res: Response) => {
        const url = await reportsService.getDownloadUrl(
            req.ctx.user.organisationId,
            param(req.params.reportId)
        );

        await emitAuditEvent(req, 'REPORT_DOWNLOADED', 'report', param(req.params.reportId));
        sendSuccess(res, { downloadUrl: url });
    });

    router.get('/:reportId/export/json', async (req: Request, res: Response) => {
        const result = await reportsService.exportJson(
            req.ctx.user.organisationId,
            param(req.params.id),
            param(req.params.reportId)
        );

        await emitAuditEvent(req, 'REPORT_EXPORTED', 'report', param(req.params.reportId), {
            format: 'json',
        });

        sendSuccess(res, result);
    });

    return router;
}
