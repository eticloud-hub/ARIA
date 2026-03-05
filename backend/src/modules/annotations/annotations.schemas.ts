import { z } from 'zod';

export const createAnnotationSchema = z.object({
    sectionKey: z.string().min(1).max(100),
    body: z.string().min(1).max(5000),
});

export const updateAnnotationSchema = z.object({
    body: z.string().min(1).max(5000),
});
