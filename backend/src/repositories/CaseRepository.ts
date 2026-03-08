import { BaseRepository } from './BaseRepository';
import type { Case } from '../shared/types';
import { NotFoundError } from '../shared/errors';

/**
 * CaseRepository — All SQL for the Cases domain.
 *
 * Refactored from CasesService:
 * - Reference IDs now use PostgreSQL sequence (no more COUNT(*)+1 race condition)
 * - Org-scoped queries extracted into typed methods
 * - Business logic stays in the service; SQL stays here
 */
export class CaseRepository extends BaseRepository {

    async create(
        id: string,
        organisationId: string,
        userId: string,
        data: { title: string; description?: string; metadata?: Record<string, unknown> }
    ): Promise<Case> {
        const referenceId = await this.nextReferenceId();

        const { rows } = await this.query<Case>(
            `INSERT INTO cases (id, organisation_id, reference_id, title, description, metadata, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                id, organisationId, referenceId, data.title,
                data.description || null,
                data.metadata ? JSON.stringify(data.metadata) : null,
                userId,
            ]
        );

        return rows[0]!;
    }

    async findByOrgId(
        organisationId: string,
        options: { status?: string; search?: string; cursor?: string; limit: number }
    ): Promise<{ rows: Case[]; hasMore: boolean; nextCursor: string | null }> {
        let whereClause = 'WHERE c.organisation_id = $1 AND c.deleted_at IS NULL';
        const params: unknown[] = [organisationId];
        let idx = 2;

        if (options.status) {
            whereClause += ` AND c.status = $${idx}`;
            params.push(options.status);
            idx++;
        }

        if (options.search) {
            whereClause += ` AND search_vector @@ plainlyto_tsquery('english', $${idx})`;
            params.push(options.search);
            idx++;
        }

        if (options.cursor) {
            whereClause += ` AND c.created_at < (SELECT created_at FROM cases WHERE id = $${idx})`;
            params.push(options.cursor);
            idx++;
        }

        params.push(options.limit + 1);

        const { rows } = await this.query<Case>(
            `SELECT c.* FROM cases c ${whereClause}
             ORDER BY c.created_at DESC
             LIMIT $${idx}`,
            params
        );

        const hasMore = rows.length > options.limit;
        const cases = hasMore ? rows.slice(0, options.limit) : rows;
        const nextCursor = hasMore && cases.length > 0
            ? cases[cases.length - 1]!.id
            : null;

        return { rows: cases, hasMore, nextCursor };
    }

    async findCaseById(organisationId: string, caseId: string): Promise<Case | null> {
        return super.findById<Case>('cases', caseId, organisationId);
    }

    async getByIdOrThrow(organisationId: string, caseId: string): Promise<Case> {
        const result = await this.findCaseById(organisationId, caseId);
        if (!result) throw new NotFoundError('Case');
        return result;
    }

    async update(
        organisationId: string,
        caseId: string,
        data: { title?: string; description?: string; metadata?: Record<string, unknown> }
    ): Promise<Case> {
        const { rows } = await this.query<Case>(
            `UPDATE cases SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                metadata = COALESCE($3, metadata)
             WHERE id = $4 AND organisation_id = $5 AND deleted_at IS NULL
             RETURNING *`,
            [
                data.title || null,
                data.description || null,
                data.metadata ? JSON.stringify(data.metadata) : null,
                caseId,
                organisationId,
            ]
        );

        if (!rows[0]) throw new NotFoundError('Case');
        return rows[0];
    }

    async softDelete(organisationId: string, caseId: string): Promise<void> {
        const { rowCount } = await this.query(
            'UPDATE cases SET deleted_at = now() WHERE id = $1 AND organisation_id = $2 AND deleted_at IS NULL',
            [caseId, organisationId]
        );
        if (rowCount === 0) throw new NotFoundError('Case');
    }

    /**
     * Generate next reference ID using PostgreSQL sequence.
     *
     * Before (race condition):  SELECT COUNT(*) + 1 FROM cases WHERE ...
     * After  (atomic):          SELECT nextval('case_ref_seq')
     *
     * This is guaranteed unique under concurrent load.
     */
    private async nextReferenceId(): Promise<string> {
        const year = new Date().getFullYear();
        const { rows } = await this.query<{ nextval: string }>(
            `SELECT nextval('case_ref_seq')::text`
        );
        const seq = parseInt(rows[0]!.nextval, 10);
        return `ARIA-${year}-${seq.toString().padStart(4, '0')}`;
    }
}
