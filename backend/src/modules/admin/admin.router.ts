import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { emitAuditEvent } from '../../middleware/audit';
import { createUserSchema, updateUserSchema, auditLogQuerySchema } from './admin.schemas';
import { sendSuccess, sendCreated } from '../../shared/envelope';
import { param } from '../../shared/params';
import type { Container } from '../../container';

export function createAdminRouter(container: Container): Router {
    const router = Router();
    const { adminService } = container;
    const { authenticate } = container.authMiddleware;

    router.use(authenticate, requireAdmin);

    router.get('/users', async (req: Request, res: Response) => {
        const users = await adminService.listUsers(req.ctx.user.organisationId);
        sendSuccess(res, users);
    });

    router.post(
        '/users',
        validate({ body: createUserSchema }),
        async (req: Request, res: Response) => {
            const user = await adminService.createUser(req.ctx.user.organisationId, req.body);
            await emitAuditEvent(req, 'USER_CREATED', 'user', user.id, { email: user.email, role: user.role });
            sendCreated(res, user);
        }
    );

    router.patch(
        '/users/:id',
        validate({ body: updateUserSchema }),
        async (req: Request, res: Response) => {
            const user = await adminService.updateUser(req.ctx.user.organisationId, param(req.params.id), req.body);
            await emitAuditEvent(req, 'USER_UPDATED', 'user', user.id);
            sendSuccess(res, user);
        }
    );

    router.get(
        '/audit-log',
        validate({ query: auditLogQuerySchema }),
        async (req: Request, res: Response) => {
            const result = await adminService.getAuditLog(
                req.ctx.user.organisationId,
                req.query as unknown as {
                    cursor?: string; limit: number;
                    eventType?: string; entityType?: string;
                    entityId?: string; actorId?: string;
                }
            );

            sendSuccess(res, result.events, 200, {
                cursor: result.nextCursor,
                has_more: result.hasMore,
            });
        }
    );

    return router;
}
