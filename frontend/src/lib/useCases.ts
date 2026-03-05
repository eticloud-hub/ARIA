import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import axios from 'axios';
import api from './api';
import type { ApiResponse } from './api';
import { adaptCase, adaptArtifact } from './adapters';
import type { CaseDto, ArtifactDto } from './adapters';

// ============================================================================
// Query Keys — centralised for cache control
// ============================================================================

export const caseKeys = {
    all: ['cases'] as const,
    lists: () => [...caseKeys.all, 'list'] as const,
    list: (filters: CaseListFilters) => [...caseKeys.lists(), filters] as const,
    details: () => [...caseKeys.all, 'detail'] as const,
    detail: (id: string) => [...caseKeys.details(), id] as const,
    artifacts: (caseId: string) => [...caseKeys.detail(caseId), 'artifacts'] as const,
};

// ============================================================================
// Types
// ============================================================================

export interface CaseListFilters {
    status?: CaseDto['status'];
    limit?: number;
}

interface CreateCaseInput {
    title: string;
    description?: string;
    metadata?: Record<string, unknown>;
}

interface ApiCaseListPage {
    data: CaseDto[];
    nextCursor: string | null;
    hasMore: boolean;
}

interface UploadProgress {
    phase: 'hashing' | 'requesting-url' | 'uploading' | 'confirming' | 'done' | 'error';
    percent: number;
    bytesUploaded: number;
    bytesTotal: number;
    error?: string;
}

type ArtifactFormat = 'evtx' | 'pcap' | 'csv' | 'json';

// ============================================================================
// useCases — paginated list with cursor-based infinite loading
// ============================================================================

export function useCases(filters: CaseListFilters = {}) {
    return useInfiniteQuery<ApiCaseListPage>({
        queryKey: caseKeys.list(filters),
        queryFn: async ({ pageParam }) => {
            const params: Record<string, string | number> = {
                limit: filters.limit ?? 20,
            };
            if (filters.status) params.status = filters.status;
            if (pageParam) params.cursor = pageParam as string;

            const { data } = await api.get<ApiResponse<any[]>>('/cases', { params });

            return {
                data: data.data.map(adaptCase),
                nextCursor: data.meta.pagination?.cursor ?? null,
                hasMore: data.meta.pagination?.has_more ?? false,
            };
        },
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) =>
            lastPage.hasMore ? lastPage.nextCursor : undefined,
    });
}

// ============================================================================
// useCase — single case by ID
// ============================================================================

export function useCase(caseId: string | undefined) {
    return useQuery<CaseDto>({
        queryKey: caseKeys.detail(caseId!),
        queryFn: async () => {
            const { data } = await api.get<ApiResponse<any>>(`/cases/${caseId}`);
            return adaptCase(data.data);
        },
        enabled: !!caseId,
    });
}

// ============================================================================
// useCreateCase — mutation with optimistic list invalidation
// ============================================================================

export function useCreateCase() {
    const queryClient = useQueryClient();

    return useMutation<CaseDto, Error, CreateCaseInput>({
        mutationFn: async (input) => {
            const { data } = await api.post<ApiResponse<any>>('/cases', input);
            return adaptCase(data.data);
        },
        onSuccess: (newCase) => {
            // Invalidate all lists so they refetch
            queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
            // Pre-populate the detail cache
            queryClient.setQueryData(caseKeys.detail(newCase.id), newCase);
        },
    });
}

// ============================================================================
// useCaseArtifacts — list artifacts for a case
// ============================================================================

export function useCaseArtifacts(caseId: string | undefined) {
    return useQuery<ArtifactDto[]>({
        queryKey: caseKeys.artifacts(caseId!),
        queryFn: async () => {
            const { data } = await api.get<ApiResponse<any[]>>(
                `/cases/${caseId}/artifacts`
            );
            return data.data.map(adaptArtifact);
        },
        enabled: !!caseId,
    });
}

// ============================================================================
// useUploadArtifact — secure file upload with progress tracking
// ============================================================================

/**
 * Secure artifact upload hook.
 *
 * Flow (presigned S3 URL):
 *   1. Hash the file client-side (SHA-256) for integrity verification
 *   2. Request a presigned upload URL from backend
 *   3. Upload file directly to S3 using the presigned URL (with progress)
 *   4. Confirm upload completion with the backend
 *
 * The backend validates: org ownership, file format, file size, SHA-256 match.
 */
export function useUploadArtifact(caseId: string) {
    const queryClient = useQueryClient();

    const [progress, setProgress] = useState<UploadProgress>({
        phase: 'done',
        percent: 0,
        bytesUploaded: 0,
        bytesTotal: 0,
    });

    const upload = useCallback(
        async (file: File, format: ArtifactFormat): Promise<ArtifactDto> => {
            const bytesTotal = file.size;

            try {
                // ── Phase 1: Hash the file ──
                setProgress({
                    phase: 'hashing',
                    percent: 0,
                    bytesUploaded: 0,
                    bytesTotal,
                });

                const hash = await hashFile(file);

                // ── Phase 2: Request presigned URL ──
                setProgress({
                    phase: 'requesting-url',
                    percent: 5,
                    bytesUploaded: 0,
                    bytesTotal,
                });

                const { data: urlResponse } = await api.post<
                    ApiResponse<{
                        uploadUrl: string;
                        artifactId: string;
                    }>
                >(`/cases/${caseId}/artifacts/upload-url`, {
                    filename: file.name,
                    fileFormat: format,
                    fileSizeBytes: file.size,
                    sha256Hash: hash,
                });

                const { uploadUrl, artifactId } = urlResponse.data;

                // ── Phase 3: Upload to S3 ──
                setProgress({
                    phase: 'uploading',
                    percent: 10,
                    bytesUploaded: 0,
                    bytesTotal,
                });

                await axios.put(uploadUrl, file, {
                    headers: {
                        'Content-Type': 'application/octet-stream',
                    },
                    // Don't send auth headers to S3
                    withCredentials: false,
                    onUploadProgress: (progressEvent) => {
                        const loaded = progressEvent.loaded ?? 0;
                        // Scale upload to 10%–90% of total progress
                        const uploadPercent = bytesTotal > 0
                            ? Math.round((loaded / bytesTotal) * 80) + 10
                            : 10;

                        setProgress({
                            phase: 'uploading',
                            percent: Math.min(uploadPercent, 90),
                            bytesUploaded: loaded,
                            bytesTotal,
                        });
                    },
                });

                // ── Phase 4: Confirm upload ──
                setProgress({
                    phase: 'confirming',
                    percent: 95,
                    bytesUploaded: bytesTotal,
                    bytesTotal,
                });

                const { data: confirmResponse } = await api.post<ApiResponse<any>>(
                    `/cases/${caseId}/artifacts/confirm`,
                    { artifactId }
                );

                const artifact = adaptArtifact(confirmResponse.data);

                // ── Done ──
                setProgress({
                    phase: 'done',
                    percent: 100,
                    bytesUploaded: bytesTotal,
                    bytesTotal,
                });

                // Invalidate artifact list cache
                queryClient.invalidateQueries({
                    queryKey: caseKeys.artifacts(caseId),
                });

                return artifact;
            } catch (err: any) {
                const message =
                    err?.response?.data?.error?.message ||
                    err?.message ||
                    'Upload failed';

                setProgress({
                    phase: 'error',
                    percent: 0,
                    bytesUploaded: 0,
                    bytesTotal,
                    error: message,
                });

                throw err;
            }
        },
        [caseId, queryClient]
    );

    const resetProgress = useCallback(() => {
        setProgress({
            phase: 'done',
            percent: 0,
            bytesUploaded: 0,
            bytesTotal: 0,
        });
    }, []);

    return { upload, progress, resetProgress };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Compute SHA-256 hash of a File using the Web Crypto API.
 * Streams in chunks to avoid loading the entire file into memory.
 */
async function hashFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
