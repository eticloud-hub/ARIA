import { z } from 'zod';
import { sanitizeHtml } from '../../utils/sanitize';

export const createUserSchema = z.object({
    email: z.string().email(),
    fullName: z.string().min(1).max(200).transform(sanitizeHtml),
    role: z.enum(['admin', 'investigator', 'reviewer']),
    password: z.string().min(12, 'Password must be at least 12 characters'),
});

export const updateUserSchema = z.object({
    role: z.enum(['admin', 'investigator', 'reviewer']).optional(),
    isActive: z.boolean().optional(),
    fullName: z.string().min(1).max(200).optional().transform(v => v ? sanitizeHtml(v) : v),
});

export const auditLogQuerySchema = z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    eventType: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().uuid().optional(),
    actorId: z.string().uuid().optional(),
});
