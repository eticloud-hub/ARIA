import { createClient } from '@supabase/supabase-js';
import { DuplicateError, NotFoundError } from '../../shared/errors';
import type { AdminRepository } from './admin.repository';
import type { User, AuditEvent, UserRole } from '../../shared/types';
import { getConfig } from '../../config';

type SafeUser = Omit<User, 'password_hash' | 'mfa_secret' | 'mfa_backup_codes' | 'mfa_salt'>;

/**
 * AdminService — Business logic only.
 */
export class AdminService {
    private supabaseAdmin;

    constructor(private readonly adminRepo: AdminRepository) {
        const config = getConfig();
        this.supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    }

    async listUsers(organisationId: string): Promise<SafeUser[]> {
        return this.adminRepo.listUsers(organisationId);
    }

    async createUser(
        organisationId: string,
        data: { email: string; fullName: string; role: UserRole; password: string }
    ): Promise<SafeUser> {
        const existing = await this.adminRepo.findUserByEmail(data.email);
        if (existing) throw new DuplicateError('User', 'email');

        // Note: Password hashing is completely offloaded to Supabase Auth API
        const { data: authData, error } = await this.supabaseAdmin.auth.admin.createUser({
            email: data.email,
            password: data.password,
            email_confirm: true,
            user_metadata: {
                full_name: data.fullName,
                role: data.role
            }
        });

        if (error) {
            throw new Error(`Failed to provision user in identity provider: ${error.message}`);
        }

        const newUserId = authData.user.id;

        // Create local mirror record for RBAC relational integrity (e.g referencing in reports)
        return this.adminRepo.createUser(newUserId, organisationId, data.email, '', data.fullName, data.role);
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
