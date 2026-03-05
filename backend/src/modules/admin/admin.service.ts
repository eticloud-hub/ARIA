import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DuplicateError, NotFoundError } from '../../shared/errors';
import type { AdminRepository } from './admin.repository';
import type { User, AuditEvent, UserRole } from '../../shared/types';

type SafeUser = Omit<User, 'password_hash' | 'mfa_secret' | 'mfa_backup_codes' | 'mfa_salt'>;

/**
 * AdminService — Business logic only.
 */
export class AdminService {
    constructor(private readonly adminRepo: AdminRepository) { }

    async listUsers(organisationId: string): Promise<SafeUser[]> {
        return this.adminRepo.listUsers(organisationId);
    }

    async createUser(
        organisationId: string,
        data: { email: string; fullName: string; role: UserRole; password: string }
    ): Promise<SafeUser> {
        const existing = await this.adminRepo.findUserByEmail(data.email);
        if (existing) throw new DuplicateError('User', 'email');

        const passwordHash = await bcrypt.hash(data.password, 12);
        return this.adminRepo.createUser(uuidv4(), organisationId, data.email, passwordHash, data.fullName, data.role);
    }

    async updateUser(
        organisationId: string,
        userId: string,
        data: { role?: UserRole; isActive?: boolean; fullName?: string }
    ): Promise<SafeUser> {
        const result = await this.adminRepo.updateUser(userId, organisationId, data);
        if (!result) throw new NotFoundError('User');
        return result;
    }

    async getAuditLog(
        organisationId: string,
        options: {
            cursor?: string; limit: number;
            eventType?: string; entityType?: string;
            entityId?: string; actorId?: string;
        }
    ): Promise<{ events: AuditEvent[]; hasMore: boolean; nextCursor: string | null }> {
        return this.adminRepo.queryAuditLog(organisationId, options);
    }
}
