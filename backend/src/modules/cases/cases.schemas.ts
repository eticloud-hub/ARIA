import { z } from 'zod';
import { sanitizeHtml } from '../../utils/sanitize';

export const createCaseSchema = z.object({
    title: z.string().min(1).max(200).transform(sanitizeHtml),
    description: z.string().max(2000).optional().transform(v => v ? sanitizeHtml(v) : v),
    metadata: z.record(z.unknown()).optional(),
});

export const updateCaseSchema = z.object({
    title: z.string().min(1).max(200).optional().transform(v => v ? sanitizeHtml(v) : v),
    description: z.string().max(2000).optional().transform(v => v ? sanitizeHtml(v) : v),
    metadata: z.record(z.unknown()).optional(),
});

export const listCasesQuerySchema = z.object({
    status: z.enum(['draft', 'ingesting', 'queued', 'analysing', 'complete', 'error']).optional(),
    search: z.string().optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
});

export const caseIdParamSchema = z.object({
    id: z.string().uuid('Invalid case ID format'),
});
