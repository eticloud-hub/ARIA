import { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool';
import type { AuditEventType } from '../shared/types';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('audit');

/**
 * Audit Event Emitter
 * Per TRD §05: Every mutation triggers an insert into audit_events.
 * audit_events is append-only — triggers prevent UPDATE/DELETE.
 */
export async function emitAuditEvent(
    req: Request,
    eventType: AuditEventType,
    entityType: string,
    entityId: string,
    payload?: Record<string, unknown>
): Promise<void> {
    try {
        await query(
            `INSERT INTO audit_events (organisation_id, actor_id, event_type, entity_type, entity_id, payload, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                req.ctx?.user?.organisationId || null,
                req.ctx?.user?.id || null,
                eventType,
                entityType,
                entityId,
                payload ? JSON.stringify(payload) : null,
                req.ctx?.ipAddress || req.ip || null,
            ]
        );
    } catch (err) {
        // Audit logging must never crash the request
        log.error({ err, eventType, entityType, entityId }, 'Failed to emit audit event');
    }
}

/**
 * Middleware that auto-logs request completion for auditable routes
 */
export function auditMiddleware(eventType: AuditEventType, entityType: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Store audit intent — will be executed after response
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const entityId = (req.params.id || req.params.caseId || 'unknown') as string;
                emitAuditEvent(req, eventType, entityType, entityId).catch(() => { });
            }
        });
        next();
    };
}
