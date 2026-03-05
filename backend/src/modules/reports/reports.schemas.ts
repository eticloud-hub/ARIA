import { z } from 'zod';

export const generateReportSchema = z.object({
    analysisResultId: z.string().uuid(),
});

export const reportIdParamSchema = z.object({
    reportId: z.string().uuid(),
});
