import { z } from 'zod';
import { sanitizeHtml } from '../../utils/sanitize';

export const createAnnotationSchema = z.object({
    sectionKey: z.string().min(1).max(100).transform(sanitizeHtml),
    body: z.string().min(1).max(5000).transform(sanitizeHtml),
});

export const updateAnnotationSchema = z.object({
    body: z.string().min(1).max(5000).transform(sanitizeHtml),
});
