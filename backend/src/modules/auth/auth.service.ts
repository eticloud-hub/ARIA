import bcrypt from 'bcryptjs';
import { InvalidCredentialsError } from '../../shared/errors';
import type { AuthRepository } from './auth.repository';
import type { TokenService } from './token.service';
import type { MfaService } from './mfa.service';

/**
 * AuthService — Slim orchestrator for login/logout flows.
 *
 * Refactored from v1 (297 lines, 9 responsibilities) into:
 * - AuthService   → login, logout orchestration (this file — ~70 lines)
 * - TokenService  → JWT generation, refresh token rotation, token_version revocation
 * - MfaService    → TOTP setup, verification, per-user salt encryption
 * - AuthRepository → all SQL queries
 *
 * All dependencies injected via constructor.
 */
export class AuthService {
    constructor(
        private readonly authRepo: AuthRepository,
        private readonly tokenService: TokenService,
        private readonly mfaService: MfaService
    ) { }

    async login(
        email: string,
        password: string,
        ipAddress: string,
        userAgent: string
    ): Promise<{
        accessToken: string;
        refreshToken: string;
        requiresMfa: boolean;
        user: { id: string; email: string; fullName: string; role: string };
    }> {
        const user = await this.authRepo.findActiveUserByEmail(email);
        if (!user) throw new InvalidCredentialsError();

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) throw new InvalidCredentialsError();

        const mfaVerified = !user.mfa_enabled;
        const accessToken = await this.tokenService.createAccessTokenForUser(user, mfaVerified);
        const refreshToken = await this.tokenService.createRefreshToken(user.id, ipAddress, userAgent);

        await this.authRepo.updateLastLogin(user.id);

        return {
            accessToken,
            refreshToken,
            requiresMfa: user.mfa_enabled,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
            },
        };
    }

    async refresh(
        refreshTokenValue: string,
        ipAddress: string,
        userAgent: string
    ): Promise<{ accessToken: string; refreshToken: string }> {
        return this.tokenService.rotateRefreshToken(refreshTokenValue, ipAddress, userAgent);
    }

    async logout(refreshTokenValue: string): Promise<void> {
        await this.tokenService.revokeByValue(refreshTokenValue);
    }

    async verifyMfa(
        userId: string,
        code: string,
        organisationId: string,
        role: string
    ): Promise<{ accessToken: string }> {
        // Get current token_version to embed in the upgraded JWT
        const tokenVersion = await this.authRepo.getTokenVersion(userId);
        return this.mfaService.verify(userId, code, organisationId, role, tokenVersion);
    }

    async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
        return this.mfaService.setup(userId);
    }
}
