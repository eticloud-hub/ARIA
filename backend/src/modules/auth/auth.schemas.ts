import { z } from 'zod';

export const loginSchema = z.object({
    email: z.string().email('Valid email is required'),
    password: z.string().min(1, 'Password is required'),
});

export const mfaVerifySchema = z.object({
    code: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d+$/, 'TOTP code must be numeric'),
});

export const refreshSchema = z.object({
    // Refresh token comes from HttpOnly cookie, no body needed
});

export type LoginInput = z.infer<typeof loginSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
