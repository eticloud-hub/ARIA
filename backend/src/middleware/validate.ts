import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../shared/errors';

/**
 * Zod request validation middleware
 * Validates body, query, and/or params against provided schemas.
 * Per TRD §08: Strict TypeScript. Zod schemas for all API responses.
 */
export function validate(schemas: {
    body?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
}) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query) as Record<string, string>;
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params) as Record<string, string>;
            }
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                const firstError = err.errors[0];
                throw new ValidationError(
                    firstError.message,
                    firstError.path.join('.')
                );
            }
            throw err;
        }
    };
}
