import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors';
import { sendError } from '../shared/envelope';
import { logger } from '../utils/logger';

/**
 * Global error handler — maps AppError subclasses to standard API error envelope.
 * Per TRD §08: Map backend error codes to user-facing responses.
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Use pino-http child logger if available, otherwise root logger
    const log = req.log || logger;

    if (err instanceof AppError) {
        // Known application error — return structured response
        if (err.statusCode >= 500) {
            log.error({ err, code: err.code, field: err.field }, err.message);
        } else {
            log.warn({ code: err.code, field: err.field }, err.message);
        }

        sendError(res, err.statusCode, err.code, err.message, err.field);
        return;
    }

    // Unknown error — return 500
    console.error('Unhandled Server Exception:', err);
    log.error({ err }, 'Unhandled error');
    sendError(res, 500, 'INTERNAL_ERROR', err.stack ? err.stack : err.message);
}
