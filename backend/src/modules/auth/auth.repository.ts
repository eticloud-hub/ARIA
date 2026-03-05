import { BaseRepository } from '../../repositories/BaseRepository';
import type { User } from '../../shared/types';
import { NotFoundError } from '../../shared/errors';
import { invalidateTokenVersionCache } from '../../middleware/tokenVersionCache';

/**
 * AuthRepository — All SQL for Auth domain.
 *
 * Extracted from AuthService. Contains:
 * - User lookup (by email, by ID)
 * - Refresh token CRUD
 * - MFA secret/backup code persistence
 * - Token version management
 * - Last login timestamp
 */
export class AuthRepository extends BaseRepository {

    async findActiveUserByEmail(email: string): Promise<User | null> {
        const { rows } = await this.query<User>(
            'SELECT * FROM users WHERE email = $1 AND is_active = true',
            [email.toLowerCase()]
        );
        return rows[0] ?? null;
    }

    async findActiveUserById(userId: string): Promise<User | null> {
        const { rows } = await this.query<User>(
            'SELECT * FROM users WHERE id = $1 AND is_active = true',
            [userId]
        );
        return rows[0] ?? null;
    }

    async findUserMfaData(userId: string): Promise<Pick<User, 'mfa_secret' | 'mfa_backup_codes' | 'mfa_salt'> | null> {
        const { rows } = await this.query<Pick<User, 'mfa_secret' | 'mfa_backup_codes' | 'mfa_salt'>>(
            'SELECT mfa_secret, mfa_backup_codes, mfa_salt FROM users WHERE id = $1',
            [userId]
        );
        return rows[0] ?? null;
    }

    async findUserEmail(userId: string): Promise<string | null> {
        const { rows } = await this.query<{ email: string }>(
            'SELECT email FROM users WHERE id = $1',
            [userId]
        );
        return rows[0]?.email ?? null;
    }

    async updateLastLogin(userId: string): Promise<void> {
        await this.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
    }

    /**
     * Increment token_version — instantly invalidates ALL existing JWTs for this user.
     * Used on logout, ban, or password change.
     * Also evicts the Redis-cached version so the auth middleware sees the change immediately.
     */
    async incrementTokenVersion(userId: string): Promise<void> {
        await this.query(
            'UPDATE users SET token_version = token_version + 1 WHERE id = $1',
            [userId]
        );
        // Evict cached version so auth middleware fetches the new value from PG
        await invalidateTokenVersionCache(userId);
    }

    async getTokenVersion(userId: string): Promise<number> {
        const { rows } = await this.query<{ token_version: number }>(
            'SELECT token_version FROM users WHERE id = $1',
            [userId]
        );
        return rows[0]?.token_version ?? 1;
    }

    // --- MFA persistence ---

    async saveMfaSetup(
        userId: string,
        encryptedSecret: string,
        salt: string,
        hashedBackupCodes: string[]
    ): Promise<void> {
        await this.query(
            `UPDATE users SET mfa_secret = $1, mfa_salt = $2, mfa_enabled = true, mfa_backup_codes = $3 WHERE id = $4`,
            [encryptedSecret, salt, hashedBackupCodes, userId]
        );
    }

    async updateBackupCodes(userId: string, codes: string[]): Promise<void> {
        await this.query(
            'UPDATE users SET mfa_backup_codes = $1 WHERE id = $2',
            [codes, userId]
        );
    }

    // --- Refresh token persistence ---

    async findRefreshToken(tokenHash: string): Promise<{
        id: string;
        user_id: string;
        expires_at: Date;
        revoked_at: Date | null;
    } | null> {
        const { rows } = await this.query<{
            id: string;
            user_id: string;
            expires_at: Date;
            revoked_at: Date | null;
        }>(
            `SELECT id, user_id, expires_at, revoked_at
             FROM refresh_tokens
             WHERE token_hash = $1`,
            [tokenHash]
        );
        return rows[0] ?? null;
    }

    async createRefreshToken(
        userId: string,
        tokenHash: string,
        ipAddress: string,
        userAgent: string,
        expiresAt: Date
    ): Promise<void> {
        await this.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, user_agent, expires_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, tokenHash, ipAddress, userAgent, expiresAt]
        );
    }

    async revokeRefreshToken(tokenId: string): Promise<void> {
        await this.query(
            'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1',
            [tokenId]
        );
    }

    async revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
        await this.query(
            'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1',
            [tokenHash]
        );
    }
}
