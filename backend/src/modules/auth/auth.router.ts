import { Router, Request, Response } from 'express';
import { validate } from '../../middleware/validate';
import { loginRateLimiter } from '../../middleware/rateLimiter';
import { emitAuditEvent } from '../../middleware/audit';
import { loginSchema, mfaVerifySchema } from './auth.schemas';
import { sendSuccess } from '../../shared/envelope';
import { getConfig } from '../../config';
import type { Container } from '../../container';

export function createAuthRouter(container: Container): Router {
    const router = Router();
    const { authService } = container;
    const { authenticate } = container.authMiddleware;

    /**
     * POST /api/v1/auth/login
     */
    router.post(
        '/login',
        loginRateLimiter,
        validate({ body: loginSchema }),
        async (req: Request, res: Response) => {
            const { email, password } = req.body;
            const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
            const userAgent = req.headers['user-agent'] || 'unknown';

            const result = await authService.login(email, password, ipAddress, userAgent);

            const config = getConfig();
            res.cookie('aria_refresh_token', result.refreshToken, {
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
                path: '/api/v1/auth',
            });

            await emitAuditEvent(req, 'USER_LOGIN', 'user', result.user.id, { ip: ipAddress });

            sendSuccess(res, {
                accessToken: result.accessToken,
                requiresMfa: result.requiresMfa,
                user: result.user,
            });
        }
    );

    /**
     * POST /api/v1/auth/refresh
     */
    router.post('/refresh', async (req: Request, res: Response) => {
        const refreshToken = req.cookies?.aria_refresh_token;
        if (!refreshToken) {
            res.status(401).json({ error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token provided.' } });
            return;
        }

        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        const result = await authService.refresh(refreshToken, ipAddress, userAgent);

        const config = getConfig();
        res.cookie('aria_refresh_token', result.refreshToken, {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
            path: '/api/v1/auth',
        });

        sendSuccess(res, { accessToken: result.accessToken });
    });

    /**
     * POST /api/v1/auth/logout
     */
    router.post('/logout', authenticate, async (req: Request, res: Response) => {
        const refreshToken = req.cookies?.aria_refresh_token;
        if (refreshToken) {
            await authService.logout(refreshToken);
        }

        res.clearCookie('aria_refresh_token', { path: '/api/v1/auth' });
        await emitAuditEvent(req, 'USER_LOGOUT', 'user', req.ctx.user.id);
        sendSuccess(res, { message: 'Logged out successfully.' });
    });

    /**
     * POST /api/v1/auth/mfa/verify
     */
    router.post(
        '/mfa/verify',
        authenticate,
        validate({ body: mfaVerifySchema }),
        async (req: Request, res: Response) => {
            const { code } = req.body;
            const result = await authService.verifyMfa(
                req.ctx.user.id,
                code,
                req.ctx.user.organisationId,
                req.ctx.user.role
            );

            await emitAuditEvent(req, 'MFA_VERIFIED', 'user', req.ctx.user.id);
            sendSuccess(res, { accessToken: result.accessToken });
        }
    );

    /**
     * POST /api/v1/auth/mfa/setup
     */
    router.post('/mfa/setup', authenticate, async (req: Request, res: Response) => {
        const result = await authService.setupMfa(req.ctx.user.id);
        await emitAuditEvent(req, 'MFA_SETUP', 'user', req.ctx.user.id);
        sendSuccess(res, result);
    });

    return router;
}
