import { BaseRepository } from '../../repositories/BaseRepository';
import type { Artifact, FileFormat } from '../../shared/types';
import { NotFoundError } from '../../shared/errors';

/**
 * ArtifactRepository — All artifact SQL.
 */
export class ArtifactRepository extends BaseRepository {

    async create(
        id: string,
        caseId: string,
        organisationId: string,
        filename: string,
        s3Key: string,
        fileFormat: FileFormat,
        fileSizeBytes: number,
        sha256Hash: string,
        uploadedBy: string
    ): Promise<void> {
        await this.query(
            `INSERT INTO artifacts (id, case_id, organisation_id, filename, s3_key, file_format, file_size_bytes, sha256_hash, ingest_status, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploading', $9)`,
            [id, caseId, organisationId, filename, s3Key, fileFormat, fileSizeBytes, sha256Hash, uploadedBy]
        );
    }

    async findByIdAndOrg(artifactId: string, organisationId: string): Promise<Artifact | null> {
        const { rows } = await this.query<Artifact>(
            'SELECT * FROM artifacts WHERE id = $1 AND organisation_id = $2',
            [artifactId, organisationId]
        );
        return rows[0] ?? null;
    }

    async markValid(artifactId: string): Promise<Artifact> {
        const { rows } = await this.query<Artifact>(
            `UPDATE artifacts SET ingest_status = 'valid' WHERE id = $1 RETURNING *`,
            [artifactId]
        );
        if (!rows[0]) throw new NotFoundError('Artifact');
        return rows[0];
    }

    async updateCaseStatusToIngesting(caseId: string): Promise<void> {
        await this.query(
            `UPDATE cases SET status = 'ingesting' WHERE id = $1 AND status = 'draft'`,
            [caseId]
        );
    }

    async listByCase(caseId: string, organisationId: string): Promise<Artifact[]> {
        const { rows } = await this.query<Artifact>(
            'SELECT * FROM artifacts WHERE case_id = $1 AND organisation_id = $2 ORDER BY uploaded_at DESC',
            [caseId, organisationId]
        );
        return rows;
    }

    async getCaseStatus(caseId: string, organisationId: string): Promise<string | null> {
        const { rows } = await this.query<{ status: string }>(
            'SELECT status FROM cases WHERE id = $1 AND organisation_id = $2',
            [caseId, organisationId]
        );
        return rows[0]?.status ?? null;
    }

    async deleteArtifact(artifactId: string, caseId: string, organisationId: string): Promise<number | null> {
        const { rowCount } = await this.query(
            'DELETE FROM artifacts WHERE id = $1 AND case_id = $2 AND organisation_id = $3',
            [artifactId, caseId, organisationId]
        );
        return rowCount;
    }
}
