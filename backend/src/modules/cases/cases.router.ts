import { Router, Request, Response } from 'express';
import { requireWriteAccess, requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { emitAuditEvent } from '../../middleware/audit';
import { createCaseSchema, updateCaseSchema, listCasesQuerySchema, caseIdParamSchema } from './cases.schemas';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/envelope';
import { param } from '../../shared/params';
import type { Container } from '../../container';

/**
 * Factory function — receives dependencies from the composition root.
 * No `new CasesService()` in here.
 */
export function createCasesRouter(container: Container): Router {
    const router = Router({ mergeParams: true });
    const { casesService } = container;
    const { authenticate } = container.authMiddleware;

    router.use(authenticate);

    /**
     * GET /api/v1/cases
     */
    router.get('/', validate({ query: listCasesQuerySchema }), async (req: Request, res: Response) => {
        const { status, search, cursor, limit } = req.query as unknown as {
            status?: string; search?: string; cursor?: string; limit: number;
        };

        const result = await casesService.list(req.ctx.user.organisationId, { status, search, cursor, limit });

        sendSuccess(res, result.cases, 200, {
            cursor: result.nextCursor,
            has_more: result.hasMore,
        });
    });

    /**
     * POST /api/v1/cases
     */
    router.post(
        '/',
        requireWriteAccess,
        validate({ body: createCaseSchema }),
        async (req: Request, res: Response) => {
            const newCase = await casesService.create(
                req.ctx.user.organisationId,
                req.ctx.user.id,
                req.body
            );

            await emitAuditEvent(req, 'CASE_CREATED', 'case', newCase.id, {
                title: newCase.title,
                reference_id: newCase.reference_id,
            });

            sendCreated(res, newCase);
        }
    );

    /**
     * GET /api/v1/cases/:id
     */
    router.get('/:id', validate({ params: caseIdParamSchema }), async (req: Request, res: Response) => {
        const caseData = await casesService.getById(req.ctx.user.organisationId, param(req.params.id));
        sendSuccess(res, caseData);
    });

    /**
     * PATCH /api/v1/cases/:id
     */
    router.patch(
        '/:id',
        requireWriteAccess,
        validate({ params: caseIdParamSchema, body: updateCaseSchema }),
        async (req: Request, res: Response) => {
            const updated = await casesService.update(
                req.ctx.user.organisationId,
                param(req.params.id),
                req.body
            );

            await emitAuditEvent(req, 'CASE_UPDATED', 'case', updated.id);
            sendSuccess(res, updated);
        }
    );

    /**
     * DELETE /api/v1/cases/:id
     */
    router.delete(
        '/:id',
        requireAdmin,
        validate({ params: caseIdParamSchema }),
        async (req: Request, res: Response) => {
            await casesService.softDelete(req.ctx.user.organisationId, param(req.params.id));
            await emitAuditEvent(req, 'CASE_DELETED', 'case', param(req.params.id));
            sendNoContent(res);
        }
    );

    return router;
}
