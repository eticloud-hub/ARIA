import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ForbiddenError } from '../../shared/errors';
import type { AnnotationRepository } from './annotation.repository';
import type { ReportAnnotation } from '../../shared/types';

/**
 * AnnotationsService — Business logic only.
 */
export class AnnotationsService {
    constructor(private readonly annotationRepo: AnnotationRepository) { }

    async list(organisationId: string, reportId: string): Promise<ReportAnnotation[]> {
        return this.annotationRepo.listByReport(reportId, organisationId);
    }

    async create(
        organisationId: string,
        reportId: string,
        userId: string,
        data: { sectionKey: string; body: string }
    ): Promise<ReportAnnotation> {
        return this.annotationRepo.create(uuidv4(), reportId, organisationId, data.sectionKey, data.body, userId);
    }

    async update(
        organisationId: string,
        annotationId: string,
        userId: string,
        data: { body: string }
    ): Promise<ReportAnnotation> {
        const existing = await this.annotationRepo.findByIdAndOrg(annotationId, organisationId);
        if (!existing) throw new NotFoundError('Annotation');
        if (existing.created_by !== userId) throw new ForbiddenError('You can only edit your own annotations.');
        return this.annotationRepo.updateBody(annotationId, data.body);
    }

    async delete(organisationId: string, annotationId: string, userId: string): Promise<void> {
        const existing = await this.annotationRepo.findByIdAndOrg(annotationId, organisationId);
        if (!existing) throw new NotFoundError('Annotation');
        if (existing.created_by !== userId) throw new ForbiddenError('You can only delete your own annotations.');
        await this.annotationRepo.deleteById(annotationId);
    }
}
