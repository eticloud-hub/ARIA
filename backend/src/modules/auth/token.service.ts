import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getConfig } from '../../config';
import { AuthenticationError } from '../../shared/errors';
import type { AuthRepository } from './auth.repository';
import type { JwtPayload, User } from '../../shared/types';

/**
 * TokenService — JWT access tokens + refresh token rotation.
 *
 * Security fixes over v1:
 * 1. token_version (tv) embedded in JWT payload
 *    → Increment user.token_version to instantly invalidate ALL floating JWTs
 *    → No more 15-minute exposure window after user ban/logout
 * 2. Refresh token rotation with hash-based storage
 */
export class TokenService {
    constructor(private readonly authRepo: AuthRepository) { }

    /**
     * Generate a signed JWT access token.
     * Includes `tv` (token version) for server-side revocation.
     */
    generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
        const config = getConfig();
        return jwt.sign(payload, config.JWT_SECRET, {
            algorithm: 'HS256' as const,
            expiresIn: config.JWT_EXPIRES_IN as `${number}${'s' | 'm' | 'h' | 'd'}`,
        });
    }

    /**
     * Build and sign an access token for a given user.
     * Reads current token_version from DB to embed in JWT.
     */
    async createAccessTokenForUser(user: User, mfaVerified: boolean): Promise<string> {
        return this.generateAccessToken({
            sub: user.id,
            org: user.organisation_id,
            role: user.role,
            mfa: mfaVerified,
            tv: user.token_version,
        });
    }

    /**
     * Generate a cryptographically random refresh token, hash it, and store in DB.
     * Returns the raw token value (sent to client as HttpOnly cookie).
     */
    async createRefreshToken(
        userId: string,
        ipAddress: string,
        userAgent: string
    ): Promise<string> {
        const config = getConfig();
        const tokenValue = crypto.randomBytes(64).toString('hex');
        const tokenHash = this.hashToken(tokenValue);
        const expiresAt = new Date(
            Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000
        );

        await this.authRepo.createRefreshToken(userId, tokenHash, ipAddress, userAgent, expiresAt);
        return tokenValue;
    }

    /**
     * Validate a refresh token, rotate it (revoke old, issue new).
     * Returns new access token + new refresh token.
     */
    async rotateRefreshToken(
        refreshTokenValue: string,
        ipAddress: string,
        userAgent: string
    ): Promise<{ accessToken: string; refreshToken: string }> {
        const tokenHash = this.hashToken(refreshTokenValue);
        const record = await this.authRepo.findRefreshToken(tokenHash);

        if (!record || record.revoked_at || record.expires_at < new Date()) {
            throw new AuthenticationError('Invalid or expired refresh token.');
        }

        // Revoke old
        await this.authRepo.revokeRefreshToken(record.id);

        // Get user
        const user = await this.authRepo.findActiveUserById(record.user_id);
        if (!user) {
            throw new AuthenticationError('User account is deactivated.');
        }

        const accessToken = await this.createAccessTokenForUser(user, user.mfa_enabled);
        const newRefreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);

        return { accessToken, refreshToken: newRefreshToken };
    }

    /**
     * Revoke a refresh token by its raw value.
     */
    async revokeByValue(refreshTokenValue: string): Promise<void> {
        const tokenHash = this.hashToken(refreshTokenValue);
        await this.authRepo.revokeRefreshTokenByHash(tokenHash);
    }

    /**
     * Verify that a decoded JWT's token_version matches the DB.
     * Called from auth middleware to enforce instant revocation.
     */
    async isTokenVersionValid(userId: string, tokenVersion: number): Promise<boolean> {
        const currentVersion = await this.authRepo.getTokenVersion(userId);
        return currentVersion === tokenVersion;
    }

    hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}
