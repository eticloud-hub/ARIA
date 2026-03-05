import { BaseRepository } from '../../repositories/BaseRepository';
import type { ReportAnnotation } from '../../shared/types';
import { NotFoundError } from '../../shared/errors';

/**
 * AnnotationRepository — All annotation SQL.
 */
export class AnnotationRepository extends BaseRepository {

    async listByReport(reportId: string, organisationId: string): Promise<ReportAnnotation[]> {
        const { rows } = await this.query<ReportAnnotation>(
            `SELECT * FROM report_annotations WHERE report_id = $1 AND organisation_id = $2 ORDER BY created_at ASC`,
            [reportId, organisationId]
        );
        return rows;
    }

    async create(
        id: string,
        reportId: string,
        organisationId: string,
        sectionKey: string,
        body: string,
        createdBy: string
    ): Promise<ReportAnnotation> {
        const { rows } = await this.query<ReportAnnotation>(
            `INSERT INTO report_annotations (id, report_id, organisation_id, section_key, body, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [id, reportId, organisationId, sectionKey, body, createdBy]
        );
        return rows[0]!;
    }

    async findByIdAndOrg(annotationId: string, organisationId: string): Promise<ReportAnnotation | null> {
        const { rows } = await this.query<ReportAnnotation>(
            `SELECT * FROM report_annotations WHERE id = $1 AND organisation_id = $2`,
            [annotationId, organisationId]
        );
        return rows[0] ?? null;
    }

    async updateBody(annotationId: string, body: string): Promise<ReportAnnotation> {
        const { rows } = await this.query<ReportAnnotation>(
            `UPDATE report_annotations SET body = $1 WHERE id = $2 RETURNING *`,
            [body, annotationId]
        );
        return rows[0]!;
    }

    async deleteById(annotationId: string): Promise<void> {
        await this.query('DELETE FROM report_annotations WHERE id = $1', [annotationId]);
    }
}
