import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, ReadOnlyRoleError } from '../shared/errors';
import type { UserRole } from '../shared/types';

/**
 * RBAC Middleware
 * Per TRD §07: Role checks performed in middleware AND service layer.
 * Reviewers have Read-Only access.
 */
export function requireRole(...allowedRoles: UserRole[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.ctx?.user) {
            throw new ForbiddenError('No authenticated user context.');
        }

        const { role } = req.ctx.user;

        if (!allowedRoles.includes(role)) {
            if (role === 'reviewer') {
                throw new ReadOnlyRoleError();
            }
            throw new ForbiddenError();
        }

        next();
    };
}

/**
 * Require MFA verification for sensitive operations
 */
export function requireMfa(req: Request, _res: Response, next: NextFunction): void {
    if (!req.ctx?.user?.mfaVerified) {
        throw new ForbiddenError('MFA verification required for this operation.');
    }
    next();
}

/**
 * Convenience: require write access (admin or investigator)
 */
export const requireWriteAccess = requireRole('admin', 'investigator');

/**
 * Convenience: require admin
 */
export const requireAdmin = requireRole('admin');
