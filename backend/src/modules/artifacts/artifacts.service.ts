import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../../config';
import { NotFoundError, ArtifactFormatUnsupportedError, ForbiddenError } from '../../shared/errors';
import type { StoragePort } from '../../ports/storage.port';
import type { ArtifactRepository } from './artifact.repository';
import type { Artifact, FileFormat } from '../../shared/types';

const ALLOWED_FORMATS: FileFormat[] = ['evtx', 'pcap', 'csv', 'json'];
const CONTENT_TYPE_MAP: Record<FileFormat, string> = {
    evtx: 'application/octet-stream',
    pcap: 'application/octet-stream',
    csv: 'text/csv',
    json: 'application/json',
};

/**
 * ArtifactsService — Business logic only.
 * SQL delegated to ArtifactRepository, storage to StoragePort.
 */
export class ArtifactsService {
    constructor(
        private readonly storage: StoragePort,
        private readonly artifactRepo: ArtifactRepository
    ) { }

    async requestUploadUrl(
        organisationId: string,
        caseId: string,
        userId: string,
        data: { filename: string; fileFormat: FileFormat; fileSizeBytes: number; sha256Hash: string }
    ): Promise<{ artifactId: string; uploadUrl: string; s3Key: string; expiresAt: Date }> {
        if (!ALLOWED_FORMATS.includes(data.fileFormat)) {
            throw new ArtifactFormatUnsupportedError(data.fileFormat);
        }

        const config = getConfig();
        const artifactId = uuidv4();
        const sanitizedFilename = this.sanitizeFilename(data.filename);
        const s3Key = `${organisationId}/${caseId}/${artifactId}/${data.fileFormat}`;

        await this.artifactRepo.create(
            artifactId, caseId, organisationId, sanitizedFilename, s3Key,
            data.fileFormat, data.fileSizeBytes, data.sha256Hash, userId
        );

        const uploadResult = await this.storage.generateUploadUrl(
            config.S3_ARTIFACTS_BUCKET, s3Key,
            CONTENT_TYPE_MAP[data.fileFormat], config.S3_PRESIGNED_URL_TTL
        );

        return { artifactId, uploadUrl: uploadResult.url, s3Key, expiresAt: uploadResult.expiresAt };
    }

    async confirmUpload(organisationId: string, artifactId: string): Promise<Artifact> {
        const existing = await this.artifactRepo.findByIdAndOrg(artifactId, organisationId);
        if (!existing) throw new NotFoundError('Artifact');

        const updated = await this.artifactRepo.markValid(artifactId);
        await this.artifactRepo.updateCaseStatusToIngesting(existing.case_id);
        return updated;
    }

    async listByCase(organisationId: string, caseId: string): Promise<Artifact[]> {
        return this.artifactRepo.listByCase(caseId, organisationId);
    }

    async delete(organisationId: string, caseId: string, artifactId: string): Promise<void> {
        const caseStatus = await this.artifactRepo.getCaseStatus(caseId, organisationId);
        if (!caseStatus) throw new NotFoundError('Case');
        if (caseStatus !== 'draft') throw new ForbiddenError('Artifacts can only be deleted from draft cases.');

        const rowCount = await this.artifactRepo.deleteArtifact(artifactId, caseId, organisationId);
        if (rowCount === 0) throw new NotFoundError('Artifact');
    }

    private sanitizeFilename(raw: string): string {
        return raw.replace(/[^a-zA-Z0-9._\-\s]/g, '_').replace(/\.{2,}/g, '.').substring(0, 255);
    }
}
