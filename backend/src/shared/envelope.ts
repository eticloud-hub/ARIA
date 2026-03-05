import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ApiEnvelope } from './types';

/**
 * Standard API response envelope: { data, meta, error }
 * Per TRD §06 — All responses use a consistent envelope.
 */
export function sendSuccess<T>(
    res: Response,
    data: T,
    statusCode = 200,
    pagination?: { cursor: string | null; has_more: boolean; total?: number }
): void {
    const envelope: ApiEnvelope<T> = {
        data,
        meta: {
            request_id: (res.req as unknown as Record<string, string>).requestId || uuidv4(),
            timestamp: new Date().toISOString(),
            ...(pagination && { pagination }),
        },
        error: null,
    };
    res.status(statusCode).json(envelope);
}

export function sendError(
    res: Response,
    statusCode: number,
    code: string,
    message: string,
    field?: string
): void {
    const requestId = (res.req as unknown as Record<string, string>).requestId || uuidv4();
    const envelope: ApiEnvelope<null> = {
        data: null,
        meta: {
            request_id: requestId,
            timestamp: new Date().toISOString(),
        },
        error: {
            code,
            message,
            ...(field && { field }),
            request_id: requestId,
        },
    };
    res.status(statusCode).json(envelope);
}

export function sendCreated<T>(res: Response, data: T): void {
    sendSuccess(res, data, 201);
}

export function sendNoContent(res: Response): void {
    res.status(204).send();
}
