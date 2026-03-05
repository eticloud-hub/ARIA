import { z } from 'zod';

export const requestUploadUrlSchema = z.object({
    filename: z.string().min(1).max(255),
    fileFormat: z.enum(['evtx', 'pcap', 'csv', 'json']),
    fileSizeBytes: z.number().int().positive().max(10737418240), // 10GB max
    sha256Hash: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a valid SHA-256 hash'),
});

export const confirmUploadSchema = z.object({
    artifactId: z.string().uuid(),
});
