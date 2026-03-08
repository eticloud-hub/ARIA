import { BaseRepository } from '../../repositories/BaseRepository';
import type { User, AuditEvent, UserRole } from '../../shared/types';

type SafeUser = Omit<User, 'password_hash' | 'mfa_secret' | 'mfa_backup_codes' | 'mfa_salt'>;

/**
 * AdminRepository — All admin SQL.
 */
export class AdminRepository extends BaseRepository {

    async listUsers(organisationId: string): Promise<SafeUser[]> {
        const { rows } = await this.query<SafeUser>(
            `SELECT id, organisation_id, email, full_name, role, is_active, mfa_enabled, token_version, last_login_at, created_at, updated_at
             FROM users WHERE organisation_id = $1 ORDER BY created_at DESC`,
            [organisationId]
        );
        return rows;
    }

    async findUserByEmail(email: string): Promise<{ id: string } | null> {
        const { rows } = await this.query<{ id: string }>(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        return rows[0] ?? null;
    }

    async getUserById(id: string): Promise<SafeUser | null> {
        const { rows } = await this.query<SafeUser>(
            `SELECT id, organisation_id, email, full_name, role, is_active, mfa_enabled, last_login_at, created_at, updated_at
             FROM users WHERE id = $1`,
            [id]
        );
        return rows[0] ?? null;
    }

    async createUser(
        id: string,
        organisationId: string,
        email: string,
        passwordHash: string,
        fullName: string,
        role: UserRole
    ): Promise<SafeUser> {
        const { rows } = await this.query<SafeUser>(
            `INSERT INTO users (id, organisation_id, email, password_hash, full_name, role)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, organisation_id, email, full_name, role, is_active, mfa_enabled, token_version, last_login_at, created_at, updated_at`,
            [id, organisationId, email.toLowerCase(), passwordHash, fullName, role]
        );
        return rows[0]!;
    }

    async updateUser(
        userId: string,
        organisationId: string,
        data: { role?: UserRole | null; isActive?: boolean | null; fullName?: string | null }
    ): Promise<SafeUser | null> {
        const { rows } = await this.query<SafeUser>(
            `UPDATE users SET
                role = COALESCE($1, role),
                is_active = COALESCE($2, is_active),
                full_name = COALESCE($3, full_name)
             WHERE id = $4 AND organisation_id = $5
             RETURNING id, organisation_id, email, full_name, role, is_active, mfa_enabled, token_version, last_login_at, created_at, updated_at`,
            [data.role || null, data.isActive ?? null, data.fullName || null, userId, organisationId]
        );
        return rows[0] ?? null;
    }

    async queryAuditLog(
        organisationId: string,
        options: {
            cursor?: string; limit: number;
            eventType?: string; entityType?: string;
            entityId?: string; actorId?: string;
        }
    ): Promise<{ events: AuditEvent[]; hasMore: boolean; nextCursor: string | null }> {
        let whereClause = 'WHERE ae.organisation_id = $1';
        const params: unknown[] = [organisationId];
        let idx = 2;

        if (options.eventType) { whereClause += ` AND ae.event_type = $${idx++}`; params.push(options.eventType); }
        if (options.entityType) { whereClause += ` AND ae.entity_type = $${idx++}`; params.push(options.entityType); }
        if (options.entityId) { whereClause += ` AND ae.entity_id = $${idx++}`; params.push(options.entityId); }
        if (options.actorId) { whereClause += ` AND ae.actor_id = $${idx++}`; params.push(options.actorId); }
        if (options.cursor) {
            // Decode composite cursor: base64(createdAtIso|id)
            const decoded = Buffer.from(options.cursor, 'base64').toString('utf-8');
            const [cursorMs, cursorId] = decoded.split('|');
            if (cursorMs && cursorId) {
                // Tuple comparison for true Keyset Pagination (vital for partitioned tables)
                whereClause += ` AND (ae.created_at, ae.id) < ($${idx++}, $${idx++})`;
                params.push(new Date(Number(cursorMs)), cursorId);
            }
        }

        params.push(options.limit + 1);

        const { rows } = await this.query<AuditEvent>(
            `SELECT ae.* FROM audit_events ae ${whereClause}
             ORDER BY ae.created_at DESC, ae.id DESC LIMIT $${idx}`,
            params
        );

        const hasMore = rows.length > options.limit;
        const events = hasMore ? rows.slice(0, options.limit) : rows;

        let nextCursor: string | null = null;
        if (hasMore && events.length > 0) {
            const last = events[events.length - 1]!;
            // Encode composite cursor
            nextCursor = Buffer.from(`${last.created_at.getTime()}|${last.id}`).toString('base64');
        }

        return { events, hasMore, nextCursor };
    }
}
