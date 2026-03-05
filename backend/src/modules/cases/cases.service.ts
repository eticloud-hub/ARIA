import { v4 as uuidv4 } from 'uuid';
import type { CaseRepository } from '../../repositories/CaseRepository';
import type { Case } from '../../shared/types';

/**
 * CasesService — Business logic only.
 *
 * Refactored: All SQL is in CaseRepository. This service orchestrates
 * business rules (ID generation, data transformation) and delegates
 * persistence to the injected repository.
 */
export class CasesService {
    constructor(private readonly caseRepo: CaseRepository) { }

    async create(
        organisationId: string,
        userId: string,
        data: { title: string; description?: string; metadata?: Record<string, unknown> }
    ): Promise<Case> {
        const id = uuidv4();
        return this.caseRepo.create(id, organisationId, userId, data);
    }

    async list(
        organisationId: string,
        options: { status?: string; cursor?: string; limit: number }
    ): Promise<{ cases: Case[]; hasMore: boolean; nextCursor: string | null }> {
        const result = await this.caseRepo.findByOrgId(organisationId, options);
        return {
            cases: result.rows,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
        };
    }

    async getById(organisationId: string, caseId: string): Promise<Case> {
        return this.caseRepo.getByIdOrThrow(organisationId, caseId);
    }

    async update(
        organisationId: string,
        caseId: string,
        data: { title?: string; description?: string; metadata?: Record<string, unknown> }
    ): Promise<Case> {
        // Verify existence first (throws NotFoundError if missing)
        await this.caseRepo.getByIdOrThrow(organisationId, caseId);
        return this.caseRepo.update(organisationId, caseId, data);
    }

    async softDelete(organisationId: string, caseId: string): Promise<void> {
        return this.caseRepo.softDelete(organisationId, caseId);
    }
}
