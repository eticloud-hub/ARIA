import { z } from 'zod';

// --- Shared Constants ---
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
export const ALLOWED_FILE_FORMATS = ['evtx', 'pcap', 'csv', 'json'] as const;

// --- Shared Zod Schemas ---

export const CaseMetadataSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
    description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional(),
});

export const ReportAnnotationSchema = z.object({
    sectionKey: z.string().min(1),
    body: z.string().min(1, 'Annotation body cannot be empty').max(5000),
});

// --- Enums ---
export const UserRoleSchema = z.enum(['admin', 'investigator', 'reviewer']);
export const CaseStatusSchema = z.enum(['draft', 'ingesting', 'queued', 'analysing', 'complete', 'error']);
export const IngestStatusSchema = z.enum(['pending', 'uploading', 'valid', 'error']);
export const JobStatusSchema = z.enum(['queued', 'running', 'complete', 'failed']);

// Types extracted from schemas
export type CaseMetadata = z.infer<typeof CaseMetadataSchema>;
export type ReportAnnotationInput = z.infer<typeof ReportAnnotationSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type IngestStatus = z.infer<typeof IngestStatusSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type FileFormat = typeof ALLOWED_FILE_FORMATS[number];
