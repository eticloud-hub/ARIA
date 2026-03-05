import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { getConfig } from '../../config';
import { InvalidMfaCodeError, NotFoundError } from '../../shared/errors';
import type { AuthRepository } from './auth.repository';
import type { TokenService } from './token.service';
import type { JwtPayload } from '../../shared/types';

/**
 * MfaService — TOTP setup, verification, backup codes.
 *
 * Security fixes over v1:
 * 1. Per-user random salt for scrypt key derivation
 *    → Before: hardcoded `'aria-mfa-salt'` (if MFA_ENCRYPTION_KEY leaks, ALL secrets decryptable)
 *    → After: unique 16-byte random salt per user stored in `users.mfa_salt`
 * 2. Backup code consumption is atomic
 */
export class MfaService {
    constructor(
        private readonly authRepo: AuthRepository,
        private readonly tokenService: TokenService
    ) { }

    /**
     * Setup TOTP MFA for a user.
     * Generates secret, encrypts with per-user salt, creates backup codes.
     */
    async setup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
        const secret = authenticator.generateSecret();

        // Generate per-user unique salt (replaces hardcoded 'aria-mfa-salt')
        const salt = crypto.randomBytes(16).toString('hex');
        const encryptedSecret = this.encryptSecret(secret, salt);

        // Generate 8 backup codes, bcrypt-hash each
        const backupCodes = Array.from({ length: 8 }, () =>
            crypto.randomBytes(4).toString('hex')
        );
        const hashedBackupCodes = await Promise.all(
            backupCodes.map((code) => bcrypt.hash(code, 12))
        );

        // Persist encrypted secret + salt + backup codes
        await this.authRepo.saveMfaSetup(userId, encryptedSecret, salt, hashedBackupCodes);

        const email = await this.authRepo.findUserEmail(userId);
        const otpauthUrl = authenticator.keyuri(email || '', 'ARIA', secret);

        return { secret, otpauthUrl };
    }

    /**
     * Verify a TOTP code (or backup code) and issue an MFA-verified access token.
     */
    async verify(
        userId: string,
        code: string,
        organisationId: string,
        role: string,
        tokenVersion: number
    ): Promise<{ accessToken: string }> {
        const mfaData = await this.authRepo.findUserMfaData(userId);
        if (!mfaData) throw new NotFoundError('User');
        if (!mfaData.mfa_secret) throw new InvalidMfaCodeError();

        // Decrypt using per-user salt
        const salt = mfaData.mfa_salt;
        if (!salt) throw new InvalidMfaCodeError(); // Legacy user without salt — force re-setup
        const decryptedSecret = this.decryptSecret(mfaData.mfa_secret, salt);

        // Verify TOTP
        const isValid = authenticator.check(code, decryptedSecret);

        if (!isValid) {
            // Try backup codes
            if (mfaData.mfa_backup_codes) {
                const backupMatch = await this.consumeBackupCode(code, mfaData.mfa_backup_codes, userId);
                if (!backupMatch) throw new InvalidMfaCodeError();
            } else {
                throw new InvalidMfaCodeError();
            }
        }

        // Issue upgraded token with mfa=true
        const accessToken = this.tokenService.generateAccessToken({
            sub: userId,
            org: organisationId,
            role: role as JwtPayload['role'],
            mfa: true,
            tv: tokenVersion,
        });

        return { accessToken };
    }

    // --- Cryptography helpers ---

    /**
     * Encrypt TOTP secret using AES-256-GCM with per-user scrypt-derived key.
     *
     * Before: `scryptSync(key, 'aria-mfa-salt', 32)` — same derived key for ALL users
     * After:  `scryptSync(key, userSalt, 32)` — unique derived key per user
     */
    private encryptSecret(secret: string, salt: string): string {
        const config = getConfig();
        const key = crypto.scryptSync(config.MFA_ENCRYPTION_KEY, salt, 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(secret, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${tag}:${encrypted}`;
    }

    private decryptSecret(encrypted: string, salt: string): string {
        const config = getConfig();
        const [ivHex, tagHex, data] = encrypted.split(':');
        const key = crypto.scryptSync(config.MFA_ENCRYPTION_KEY, salt, 32);
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Try each backup code. If match found, remove it atomically.
     */
    private async consumeBackupCode(
        code: string,
        hashedCodes: string[],
        userId: string
    ): Promise<boolean> {
        for (let i = 0; i < hashedCodes.length; i++) {
            const isMatch = await bcrypt.compare(code, hashedCodes[i]);
            if (isMatch) {
                const updatedCodes = [...hashedCodes];
                updatedCodes.splice(i, 1);
                await this.authRepo.updateBackupCodes(userId, updatedCodes);
                return true;
            }
        }
        return false;
    }
}
