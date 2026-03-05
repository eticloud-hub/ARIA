// ============================================================================
// ARIA — Custom Error Classes
// Maps backend error codes to HTTP status codes for the API envelope
// ============================================================================

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly field?: string;

    constructor(statusCode: number, code: string, message: string, field?: string) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.field = field;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

// --- 400 Bad Request ---
export class ValidationError extends AppError {
    constructor(message: string, field?: string) {
        super(400, 'VALIDATION_ERROR', message, field);
    }
}

export class ArtifactHashMismatchError extends AppError {
    constructor() {
        super(400, 'ARTIFACT_HASH_MISMATCH', 'Artifact SHA-256 hash does not match the expected value.');
    }
}

export class ArtifactFormatUnsupportedError extends AppError {
    constructor(format: string) {
        super(400, 'ARTIFACT_FORMAT_UNSUPPORTED', `File format .${format} is not a supported artifact type.`, 'file_format');
    }
}

export class CaseNotAnalyzableError extends AppError {
    constructor() {
        super(400, 'CASE_NOT_ANALYZABLE', 'Case must have at least one valid artifact before analysis can start.');
    }
}

// --- 401 Unauthorized ---
export class AuthenticationError extends AppError {
    constructor(message = 'Authentication required.') {
        super(401, 'AUTHENTICATION_REQUIRED', message);
    }
}

export class InvalidCredentialsError extends AppError {
    constructor() {
        super(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
}

export class TokenExpiredError extends AppError {
    constructor() {
        super(401, 'TOKEN_EXPIRED', 'Access token has expired. Please refresh.');
    }
}

export class MfaRequiredError extends AppError {
    constructor() {
        super(401, 'MFA_REQUIRED', 'Multi-factor authentication is required.');
    }
}

export class InvalidMfaCodeError extends AppError {
    constructor() {
        super(401, 'INVALID_MFA_CODE', 'The MFA code provided is invalid or expired.');
    }
}

// --- 403 Forbidden ---
export class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to perform this action.') {
        super(403, 'FORBIDDEN', message);
    }
}

export class ReadOnlyRoleError extends AppError {
    constructor() {
        super(403, 'READ_ONLY_ROLE', 'Reviewer role has read-only access.');
    }
}

export class ReportLockedError extends AppError {
    constructor() {
        super(403, 'REPORT_LOCKED', 'This report is locked and cannot be modified.');
    }
}

// --- 404 Not Found ---
export class NotFoundError extends AppError {
    constructor(entity: string) {
        super(404, 'NOT_FOUND', `${entity} not found.`);
    }
}

// --- 409 Conflict ---
export class DuplicateError extends AppError {
    constructor(entity: string, field: string) {
        super(409, 'DUPLICATE', `A ${entity} with this ${field} already exists.`, field);
    }
}

export class AnalysisAlreadyRunningError extends AppError {
    constructor() {
        super(409, 'ANALYSIS_ALREADY_RUNNING', 'An analysis job is already running for this case.');
    }
}

// --- 429 Rate Limit ---
export class RateLimitError extends AppError {
    constructor(retryAfter: number) {
        super(429, 'RATE_LIMIT_EXCEEDED', `Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }
}
