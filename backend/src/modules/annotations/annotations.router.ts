import { Router, Request, Response } from 'express';
import { requireWriteAccess } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { emitAuditEvent } from '../../middleware/audit';
import { createAnnotationSchema, updateAnnotationSchema } from './annotations.schemas';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/envelope';
import { param } from '../../shared/params';
import type { Container } from '../../container';

export function createAnnotationsRouter(container: Container): Router {
    const router = Router({ mergeParams: true });
    const { annotationsService } = container;
    const { authenticate } = container.authMiddleware;

    router.use(authenticate);

    router.get('/', async (req: Request, res: Response) => {
        const annotations = await annotationsService.list(
            req.ctx.user.organisationId,
            param(req.params.id)
        );
        sendSuccess(res, annotations);
    });

    router.post(
        '/',
        requireWriteAccess,
        validate({ body: createAnnotationSchema }),
        async (req: Request, res: Response) => {
            const annotation = await annotationsService.create(
                req.ctx.user.organisationId,
                param(req.params.id),
                req.ctx.user.id,
                req.body
            );

            await emitAuditEvent(req, 'ANNOTATION_CREATED', 'annotation', annotation.id);
            sendCreated(res, annotation);
        }
    );

    router.patch(
        '/:annotationId',
        requireWriteAccess,
        validate({ body: updateAnnotationSchema }),
        async (req: Request, res: Response) => {
            const annotation = await annotationsService.update(
                req.ctx.user.organisationId,
                param(req.params.annotationId),
                req.ctx.user.id,
                req.body
            );

            await emitAuditEvent(req, 'ANNOTATION_UPDATED', 'annotation', annotation.id);
            sendSuccess(res, annotation);
        }
    );

    router.delete(
        '/:annotationId',
        requireWriteAccess,
        async (req: Request, res: Response) => {
            await annotationsService.delete(
                req.ctx.user.organisationId,
                param(req.params.annotationId),
                req.ctx.user.id
            );

            await emitAuditEvent(req, 'ANNOTATION_DELETED', 'annotation', param(req.params.annotationId));
            sendNoContent(res);
        }
    );

    return router;
}
