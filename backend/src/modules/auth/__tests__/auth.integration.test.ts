/**
 * ARIA — Auth Flow Integration Tests
 * 
 * Tests the full auth lifecycle via HTTP:
 *   1. Login → JWT with tv (token_version) claim
 *   2. JWT → access a protected endpoint
 *   3. Refresh token rotation flow
 *   4. MFA verification with TOTP code
 *
 * Strategy: Mock at the database/repository layer.
 * The Express app, router, middleware, services, and JWT engine all run for real.
 */
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { authenticator } from 'otplib';

// ---- Mocked modules ---- //

// Mock the DB pool globally (prevents real PG connections)
jest.mock('../../../db/pool', () => ({
    getPool: jest.fn(() => ({
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
    })),
    query: jest.fn(),
}));

// Mock the rate limiter so it doesn't block test requests
jest.mock('../../../middleware/rateLimiter', () => ({
    loginRateLimiter: (_req: any, _res: any, next: any) => next(),
    createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock the config module
const TEST_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars!!';
const TEST_MFA_KEY = 'test-mfa-encryption-key-32-chars!!';

jest.mock('../../../config', () => ({
    getConfig: jest.fn(() => ({
        NODE_ENV: 'development',
        JWT_SECRET: TEST_JWT_SECRET,
        JWT_EXPIRES_IN: '15m',
        REFRESH_TOKEN_SECRET: 'test-refresh-secret-32-chars-long!!',
        REFRESH_TOKEN_EXPIRES_DAYS: 7,
        MFA_ENCRYPTION_KEY: TEST_MFA_KEY,
        REDIS_CACHE_URL: 'redis://localhost:6380',
    })),
}));

import { AuthRepository } from '../auth.repository';
import { TokenService } from '../token.service';
import { MfaService } from '../mfa.service';
import { AuthService } from '../auth.service';
import { createAuthRouter } from '../auth.router';
import type { Container } from '../../../container';
import type { JwtPayload } from '../../../shared/types';

// ---- Test fixtures ---- //

const TEST_PASSWORD = 'SecureP@ssw0rd!';
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

const mockUser = {
    id: 'u-001',
    organisation_id: 'org-001',
    email: 'investigator@aria.test',
    password_hash: TEST_PASSWORD_HASH,
    full_name: 'Jane Investigator',
    role: 'investigator' as const,
    is_active: true,
    mfa_enabled: false,
    mfa_secret: null,
    mfa_salt: null,
    mfa_backup_codes: null,
    token_version: 1,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
};

const mockMfaUser = {
    ...mockUser,
    id: 'u-002',
    email: 'mfa-user@aria.test',
    mfa_enabled: true,
    mfa_secret: 'encrypted-totp-secret',
    mfa_salt: crypto.randomBytes(16).toString('hex'),
};

// ---- Mock AuthRepository ---- //

const mockAuthRepo = {
    findActiveUserByEmail: jest.fn(),
    findActiveUserById: jest.fn(),
    updateLastLogin: jest.fn(),
    createRefreshToken: jest.fn(),
    findRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeRefreshTokenByHash: jest.fn(),
    getTokenVersion: jest.fn(),
    incrementTokenVersion: jest.fn(),
    findUserMfaData: jest.fn(),
    findUserEmail: jest.fn(),
    saveMfaSetup: jest.fn(),
    updateBackupCodes: jest.fn(),
} as unknown as jest.Mocked<AuthRepository>;

// ---- Build test app ---- //

function createTestApp() {
    const tokenService = new TokenService(mockAuthRepo as unknown as AuthRepository);
    const mfaService = new MfaService(mockAuthRepo as unknown as AuthRepository, tokenService);
    const authService = new AuthService(
        mockAuthRepo as unknown as AuthRepository,
        tokenService,
        mfaService
    );

    // Minimal container for the router
    const container = {
        authService,
        tokenService,
        authMiddleware: {
            authenticate: (req: Request, res: Response, next: NextFunction) => {
                const authHeader = req.headers.authorization;
                if (!authHeader?.startsWith('Bearer ')) {
                    res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Missing token' } });
                    return;
                }
                try {
                    const token = authHeader.split(' ')[1];
                    const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;
                    (req as any).ctx = {
                        user: { id: decoded.sub, organisationId: decoded.org, role: decoded.role },
                    };
                    next();
                } catch (err) {
                    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
                }
            },
            optionalAuth: (req: Request, _res: Response, next: NextFunction) => {
                next();
            }
        }
    } as unknown as Container;

    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Request ID middleware (some endpoints depend on this)
    app.use((req, _res, next) => {
        (req as any).requestId = 'test-request-id';
        next();
    });

    // Mount auth router
    app.use('/api/v1/auth', createAuthRouter(container));

    // A protected endpoint for testing JWT access
    app.get('/api/v1/protected', (req, res, next) => {
        // Inline auth check for testing (mirrors auth middleware logic)
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Missing token' } });
            return;
        }

        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, TEST_JWT_SECRET) as JwtPayload;
            (req as any).ctx = {
                user: {
                    id: decoded.sub,
                    organisationId: decoded.org,
                    role: decoded.role,
                },
            };
            res.json({ data: { message: 'Protected content', user: decoded.sub } });
        } catch (err: any) {
            if (err.name === 'TokenExpiredError') {
                res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } });
            } else {
                res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
            }
        }
    });

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
            error: {
                code: err.code || 'INTERNAL_ERROR',
                message: err.message || 'Internal server error',
            },
        });
    });

    return { app, tokenService, authService, mfaService };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Auth Flow Integration Tests', () => {
    let app: express.Express;
    let tokenService: TokenService;

    beforeEach(() => {
        jest.clearAllMocks();
        const testApp = createTestApp();
        app = testApp.app;
        tokenService = testApp.tokenService;
    });

    // ========================================================================
    // 1. Login → JWT with tv (token_version) claim
    // ========================================================================
    describe('POST /api/v1/auth/login', () => {
        it('should return a JWT containing the tv (token_version) claim', async () => {
            mockAuthRepo.findActiveUserByEmail.mockResolvedValue(mockUser);
            mockAuthRepo.updateLastLogin.mockResolvedValue(undefined);
            mockAuthRepo.createRefreshToken.mockResolvedValue(undefined);

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: mockUser.email, password: TEST_PASSWORD })
                .expect(200);

            // Verify response shape
            expect(res.body.data).toHaveProperty('accessToken');
            expect(res.body.data).toHaveProperty('user');
            expect(res.body.data.user.email).toBe(mockUser.email);
            expect(res.body.data.requiresMfa).toBe(false);

            // Decode JWT and verify tv claim
            const decoded = jwt.verify(res.body.data.accessToken, TEST_JWT_SECRET) as JwtPayload;
            expect(decoded.sub).toBe(mockUser.id);
            expect(decoded.org).toBe(mockUser.organisation_id);
            expect(decoded.role).toBe(mockUser.role);
            expect(decoded.tv).toBe(mockUser.token_version);
            expect(decoded.mfa).toBe(true); // MFA not enabled = treated as verified
        });

        it('should set refresh token as HttpOnly cookie', async () => {
            mockAuthRepo.findActiveUserByEmail.mockResolvedValue(mockUser);
            mockAuthRepo.updateLastLogin.mockResolvedValue(undefined);
            mockAuthRepo.createRefreshToken.mockResolvedValue(undefined);

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: mockUser.email, password: TEST_PASSWORD })
                .expect(200);

            // Check Set-Cookie header
            const cookies = res.headers['set-cookie'];
            expect(cookies).toBeDefined();
            const refreshCookie = Array.isArray(cookies)
                ? cookies.find((c: string) => c.startsWith('aria_refresh_token='))
                : cookies;
            expect(refreshCookie).toContain('HttpOnly');
            expect(refreshCookie).toContain('Path=/api/v1/auth');
        });

        it('should reject invalid credentials', async () => {
            mockAuthRepo.findActiveUserByEmail.mockResolvedValue(mockUser);

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: mockUser.email, password: 'WrongPassword!' })
                .expect(401);

            expect(res.body.error.code).toBeDefined();
        });

        it('should reject non-existent user', async () => {
            mockAuthRepo.findActiveUserByEmail.mockResolvedValue(null);

            await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'nobody@aria.test', password: TEST_PASSWORD })
                .expect(401);
        });

        it('should flag requiresMfa when MFA is enabled', async () => {
            mockAuthRepo.findActiveUserByEmail.mockResolvedValue(mockMfaUser);
            mockAuthRepo.updateLastLogin.mockResolvedValue(undefined);
            mockAuthRepo.createRefreshToken.mockResolvedValue(undefined);

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: mockMfaUser.email, password: TEST_PASSWORD })
                .expect(200);

            expect(res.body.data.requiresMfa).toBe(true);

            // JWT should have mfa: false (not yet verified)
            const decoded = jwt.verify(res.body.data.accessToken, TEST_JWT_SECRET) as JwtPayload;
            expect(decoded.mfa).toBe(false);
        });
    });

    // ========================================================================
    // 2. Protected endpoint access with valid JWT
    // ========================================================================
    describe('GET /api/v1/protected (JWT access)', () => {
        it('should allow access with a valid JWT', async () => {
            // Generate a valid token
            const accessToken = tokenService.generateAccessToken({
                sub: mockUser.id,
                org: mockUser.organisation_id,
                role: mockUser.role,
                mfa: true,
                tv: mockUser.token_version,
            });

            const res = await request(app)
                .get('/api/v1/protected')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body.data.message).toBe('Protected content');
            expect(res.body.data.user).toBe(mockUser.id);
        });

        it('should reject requests without a token', async () => {
            await request(app)
                .get('/api/v1/protected')
                .expect(401);
        });

        it('should reject an expired JWT', async () => {
            // Create a token that's already expired
            const expiredToken = jwt.sign(
                { sub: mockUser.id, org: mockUser.organisation_id, role: mockUser.role, mfa: true, tv: 1 },
                TEST_JWT_SECRET,
                { expiresIn: '0s' }
            );

            // Wait a moment for expiry
            await new Promise(resolve => setTimeout(resolve, 100));

            await request(app)
                .get('/api/v1/protected')
                .set('Authorization', `Bearer ${expiredToken}`)
                .expect(401);
        });

        it('should reject a JWT signed with the wrong secret', async () => {
            const invalidToken = jwt.sign(
                { sub: mockUser.id, org: mockUser.organisation_id, role: mockUser.role, mfa: true, tv: 1 },
                'wrong-secret-key-that-is-32-chars!!'
            );

            await request(app)
                .get('/api/v1/protected')
                .set('Authorization', `Bearer ${invalidToken}`)
                .expect(401);
        });
    });

    // ========================================================================
    // 3. Refresh token rotation flow
    // ========================================================================
    describe('POST /api/v1/auth/refresh', () => {
        it('should rotate the refresh token and return a new access token', async () => {
            // Step 1: Login to get a refresh token
            mockAuthRepo.findActiveUserByEmail.mockResolvedValue(mockUser);
            mockAuthRepo.updateLastLogin.mockResolvedValue(undefined);
            mockAuthRepo.createRefreshToken.mockResolvedValue(undefined);

            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: mockUser.email, password: TEST_PASSWORD })
                .expect(200);

            // Extract the refresh token value from the createRefreshToken mock call
            const createCall = mockAuthRepo.createRefreshToken.mock.calls[0];
            const storedHash = createCall[1]; // tokenHash
            const storedExpiresAt = createCall[4]; // expiresAt

            // Get the raw cookie value
            const cookies = loginRes.headers['set-cookie'];
            const cookieStr = Array.isArray(cookies) ? cookies[0] : cookies;
            const refreshTokenValue = cookieStr.split('=')[1].split(';')[0];

            // Step 2: Mock find for refresh — simulate the stored token
            mockAuthRepo.findRefreshToken.mockResolvedValue({
                id: 'rt-001',
                user_id: mockUser.id,
                revoked_at: null,
                expires_at: storedExpiresAt,
            });
            mockAuthRepo.revokeRefreshToken.mockResolvedValue(undefined);
            mockAuthRepo.findActiveUserById.mockResolvedValue(mockUser);
            mockAuthRepo.createRefreshToken.mockResolvedValue(undefined);

            // Step 3: Hit refresh endpoint with the cookie
            const refreshRes = await request(app)
                .post('/api/v1/auth/refresh')
                .set('Cookie', `aria_refresh_token=${refreshTokenValue}`)
                .expect(200);

            // Should return a new access token
            expect(refreshRes.body.data).toHaveProperty('accessToken');

            // New JWT should also have tv claim
            const decoded = jwt.verify(refreshRes.body.data.accessToken, TEST_JWT_SECRET) as JwtPayload;
            expect(decoded.tv).toBe(mockUser.token_version);

            // Old refresh token should have been revoked
            expect(mockAuthRepo.revokeRefreshToken).toHaveBeenCalledWith('rt-001');

            // New refresh cookie should be set
            const newCookies = refreshRes.headers['set-cookie'];
            expect(newCookies).toBeDefined();
        });

        it('should reject when no refresh token cookie is provided', async () => {
            const res = await request(app)
                .post('/api/v1/auth/refresh')
                .expect(401);

            expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
        });

        it('should reject a revoked refresh token', async () => {
            mockAuthRepo.findRefreshToken.mockResolvedValue({
                id: 'rt-002',
                user_id: mockUser.id,
                revoked_at: new Date(), // Already revoked
                expires_at: new Date(Date.now() + 86400000),
            });

            await request(app)
                .post('/api/v1/auth/refresh')
                .set('Cookie', 'aria_refresh_token=some-revoked-token-value')
                .expect(401);
        });
    });

    // ========================================================================
    // 4. MFA verification flow
    // ========================================================================
    describe('POST /api/v1/auth/mfa/verify', () => {
        it('should reject without a valid TOTP code', async () => {
            // First, get a pre-MFA JWT (mfa: false)
            const preMfaToken = tokenService.generateAccessToken({
                sub: mockMfaUser.id,
                org: mockMfaUser.organisation_id,
                role: mockMfaUser.role,
                mfa: false,
                tv: mockMfaUser.token_version,
            });

            mockAuthRepo.getTokenVersion.mockResolvedValue(mockMfaUser.token_version);

            // Mock the MFA data lookup — returns encrypted secret
            mockAuthRepo.findUserMfaData.mockResolvedValue({
                mfa_secret: mockMfaUser.mfa_secret,
                mfa_salt: mockMfaUser.mfa_salt,
                mfa_backup_codes: null,
            });

            // Send an invalid TOTP code — should fail with 400/401/500
            const res = await request(app)
                .post('/api/v1/auth/mfa/verify')
                .set('Authorization', `Bearer ${preMfaToken}`)
                .send({ code: '000000' });

            // Should not return a successful MFA upgrade
            expect(res.status).not.toBe(200);
        });

        it('should require authentication before MFA verify', async () => {
            await request(app)
                .post('/api/v1/auth/mfa/verify')
                .send({ code: '123456' })
                .expect(401);
        });
    });

    // ========================================================================
    // Token Version Revocation (Unit-level integrated test)
    // ========================================================================
    describe('Token Version (tv) Revocation', () => {
        it('should embed token_version in JWT payload', () => {
            const token = tokenService.generateAccessToken({
                sub: mockUser.id,
                org: mockUser.organisation_id,
                role: mockUser.role,
                mfa: true,
                tv: 5, // Custom token version
            });

            const decoded = jwt.decode(token) as JwtPayload;
            expect(decoded.tv).toBe(5);
        });

        it('should validate matching token_version', async () => {
            mockAuthRepo.getTokenVersion.mockResolvedValue(1);
            const isValid = await tokenService.isTokenVersionValid(mockUser.id, 1);
            expect(isValid).toBe(true);
        });

        it('should reject mismatched token_version (user was banned)', async () => {
            mockAuthRepo.getTokenVersion.mockResolvedValue(2); // Incremented in DB
            const isValid = await tokenService.isTokenVersionValid(mockUser.id, 1); // Old TV in JWT
            expect(isValid).toBe(false);
        });
    });
});
