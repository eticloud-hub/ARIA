import { Router, Request, Response } from 'express';
import { requireWriteAccess } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { emitAuditEvent } from '../../middleware/audit';
import { requestUploadUrlSchema, confirmUploadSchema } from './artifacts.schemas';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/envelope';
import { param } from '../../shared/params';
import type { Container } from '../../container';

export function createArtifactsRouter(container: Container): Router {
    const router = Router({ mergeParams: true });
    const { artifactsService } = container;
    const { authenticate } = container.authMiddleware;

    router.use(authenticate);

    router.post(
        '/upload-url',
        requireWriteAccess,
        validate({ body: requestUploadUrlSchema }),
        async (req: Request, res: Response) => {
            const result = await artifactsService.requestUploadUrl(
                req.ctx.user.organisationId,
                param(req.params.id),
                req.ctx.user.id,
                req.body
            );

            await emitAuditEvent(req, 'ARTIFACT_UPLOADED', 'artifact', result.artifactId, {
                filename: req.body.filename,
                format: req.body.fileFormat,
            });

            sendCreated(res, result);
        }
    );

    router.post(
        '/confirm',
        requireWriteAccess,
        validate({ body: confirmUploadSchema }),
        async (req: Request, res: Response) => {
            const artifact = await artifactsService.confirmUpload(
                req.ctx.user.organisationId,
                req.body.artifactId
            );

            await emitAuditEvent(req, 'ARTIFACT_CONFIRMED', 'artifact', artifact.id, {
                sha256_hash: artifact.sha256_hash,
            });

            sendSuccess(res, artifact);
        }
    );

    router.get('/', async (req: Request, res: Response) => {
        const artifacts = await artifactsService.listByCase(
            req.ctx.user.organisationId,
            param(req.params.id)
        );
        sendSuccess(res, artifacts);
    });

    router.delete(
        '/:artifactId',
        requireWriteAccess,
        async (req: Request, res: Response) => {
            await artifactsService.delete(
                req.ctx.user.organisationId,
                param(req.params.id),
                param(req.params.artifactId)
            );

            await emitAuditEvent(req, 'ARTIFACT_DELETED', 'artifact', param(req.params.artifactId));
            sendNoContent(res);
        }
    );

    return router;
}
