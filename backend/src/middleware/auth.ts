import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';
import { AuthenticationError, TokenExpiredError } from '../shared/errors';
import type { JwtPayload, RequestContext } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRepository } from '../modules/auth/auth.repository';
import { createModuleLogger } from '../utils/logger';
import { getCachedTokenVersion, cacheTokenVersion } from './tokenVersionCache';

// Extend Express Request with our context
declare global {
    namespace Express {
        interface Request {
            ctx: RequestContext;
            requestId: string;
        }
    }
}

const log = createModuleLogger('auth');

/**
 * Auth Middleware — the return type of createAuthMiddleware.
 * Both functions are created with the same injected AuthRepository.
 */
export interface AuthMiddleware {
    authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    optionalAuth: (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Factory function — creates auth middleware with an injected AuthRepository.
 *
 * Why a factory:
 *   - The old code did `const authRepo = new AuthRepository()` at module level,
 *     bypassing the DI container and making the middleware untestable.
 *   - Now the AuthRepository is injected from the composition root (container.ts),
 *     and tests can pass a mock repository directly.
 *
 * Usage:
 *   const { authenticate, optionalAuth } = createAuthMiddleware(authRepository);
 */
export function createAuthMiddleware(authRepo: AuthRepository): AuthMiddleware {

    /**
     * Get token_version via cache-aside pattern:
     *   1. Check Redis cache (sub-ms)
     *   2. On miss → fetch from PG via injected repo
     *   3. Populate cache for next request
     *
     * Throws on ALL errors — caller must handle (fail closed).
     */
    async function getTokenVersion(userId: string): Promise<number> {
        const cached = await getCachedTokenVersion(userId);
        if (cached !== null) {
            return cached;
        }

        const dbVersion = await authRepo.getTokenVersion(userId);
        cacheTokenVersion(userId, dbVersion);
        return dbVersion;
    }

    /**
     * JWT Authentication Middleware
     *
     * Security posture: FAIL CLOSED.
     *   - If Redis is down AND PG is down → deny access (401)
     *   - If token_version check fails for any reason → deny access (401)
     *   - Revoked tokens are rejected immediately (within 30s cache TTL)
     *
     * Performance: Token_version is cached in Redis with a 30s TTL.
     *   - ~97% of requests are served from Redis (sub-ms)
     *   - PG is only hit on cold cache or after TTL expiry
     *
     * Per TRD §07 — 15-minute TTL access tokens, memory-only storage.
     */
    async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
        const requestId = uuidv4();
        req.requestId = requestId;

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new AuthenticationError('Missing or invalid Authorization header.'));
        }

        const token = authHeader.substring(7);
        const config = getConfig();

        let decoded: JwtPayload;
        try {
            decoded = jwt.verify(token, config.JWT_SECRET, {
                algorithms: ['HS256'],
            }) as JwtPayload;
        } catch (err) {
            if (err instanceof jwt.TokenExpiredError) {
                return next(new TokenExpiredError());
            }
            return next(new AuthenticationError('Invalid access token.'));
        }

        // Set request context from verified JWT
        req.ctx = {
            user: {
                id: decoded.sub,
                organisationId: decoded.org,
                role: decoded.role,
                mfaVerified: decoded.mfa,
            },
            requestId,
            ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        };

        // Token version check — instant JWT revocation (FAIL CLOSED)
        try {
            const currentVersion = await getTokenVersion(decoded.sub);

            if (decoded.tv !== undefined && decoded.tv !== currentVersion) {
                return next(new AuthenticationError('Token has been revoked.'));
            }

            next();
        } catch (err: any) {
            // FAIL CLOSED: Any infrastructure error → deny access
            log.error({ err, requestId }, 'Token version check failed — DENYING ACCESS');
            return next(new AuthenticationError('Unable to verify token. Please try again.'));
        }
    }

    /**
     * Optional auth — sets context if token present, continues regardless.
     * No token_version check (used for public endpoints with optional personalization).
     */
    function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
        req.requestId = uuidv4();

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next();
            return;
        }

        try {
            const token = authHeader.substring(7);
            const config = getConfig();
            const decoded = jwt.verify(token, config.JWT_SECRET, {
                algorithms: ['HS256'],
            }) as JwtPayload;

            req.ctx = {
                user: {
                    id: decoded.sub,
                    organisationId: decoded.org,
                    role: decoded.role,
                    mfaVerified: decoded.mfa,
                },
                requestId: req.requestId,
                ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            };
        } catch {
            // Token invalid — continue without auth context
        }

        next();
    }

    return { authenticate, optionalAuth };
}
