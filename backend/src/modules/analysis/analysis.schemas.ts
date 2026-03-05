import { z } from 'zod';

export const startAnalysisSchema = z.object({
    priority: z.enum(['standard', 'urgent']).default('standard'),
});
