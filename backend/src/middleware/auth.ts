import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';
import { AuthenticationError, TokenExpiredError } from '../shared/errors';
import type { JwtPayload, RequestContext } from '../shared/types';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { AdminRepository } from '../modules/admin/admin.repository';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('auth');

export interface AuthMiddleware {
    authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    optionalAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}

/**
 * Factory function — creates auth middleware with an injected AdminRepository.
 * Validates Supabase JWTs locally using the symmetric JWT secret, then looks up 
 * user role and RBAC context from the local database.
 */
export function createAuthMiddleware(adminRepo: AdminRepository): AuthMiddleware {

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
            // 1. Decode token payload statelessly (Algorithm-agnostic)
            // Cryptographic validation is deferred to the Supabase API below
            // to support both HS256 (symmetric) and ES256/RS256 (asymmetric) projects.
            decoded = jwt.decode(token) as JwtPayload;
            if (!decoded) {
                throw new Error('Malformed JWT');
            }

            // 2. Active Kill Switch check (Supabase Session API)
            // This aligns with Supabase's global sign-out and idle session termination
            const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            const { data, error } = await supabase.auth.getUser(token);

            if (error || !data.user) {
                log.warn({ error, requestId }, 'Active session termination trigger — Supabase session invalid');
                return next(new AuthenticationError('Session terminated or invalid.'));
            }

        } catch (err) {
            if (err instanceof jwt.TokenExpiredError) {
                return next(new TokenExpiredError());
            }
            log.error({ err, requestId }, 'JWT Signature Validation Failed');
            return next(new AuthenticationError('Invalid access token.'));
        }

        try {
            // Retrieve User Role & Org context from local DB
            const user = await adminRepo.getUserById(decoded.sub);

            if (!user) {
                log.warn({ sub: decoded.sub, requestId }, 'Authenticated user not found in local database');
                return next(new AuthenticationError('User profile not found.'));
            }

            if (!user.is_active) {
                log.warn({ sub: decoded.sub, requestId }, 'Deactivated user attempted access');
                return next(new AuthenticationError('Account is deactivated.'));
            }

            // Set request context
            req.ctx = {
                user: {
                    id: user.id,
                    organisationId: user.organisation_id,
                    role: user.role,
                    // Map Supabase exact Assurance Level 2 to our MFA verified flag
                    mfaVerified: decoded.aal === 'aal2',
                },
                requestId,
                ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
            };

            next();
        } catch (err) {
            log.error({ err, requestId }, 'Error fetching user context during authentication');
            return next(new AuthenticationError('Internal authentication error.'));
        }
    }

    async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
        req.requestId = uuidv4();

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next();
            return;
        }

        try {
            const token = authHeader.substring(7);
            const config = getConfig();
            const decoded = jwt.decode(token) as JwtPayload;
            if (!decoded) throw new Error('Invalid token');

            const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            const { data, error } = await supabase.auth.getUser(token);

            if (!error && data.user) {
                const user = await adminRepo.getUserById(decoded.sub);

                if (user && user.is_active) {
                    req.ctx = {
                        user: {
                            id: user.id,
                            organisationId: user.organisation_id,
                            role: user.role,
                            mfaVerified: decoded.aal === 'aal2',
                        },
                        requestId: req.requestId,
                        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
                    };
                }
            }
        } catch {
            // Token invalid or user not found — continue silently without auth context
        }

        next();
    }

    return { authenticate, optionalAuth };
}
