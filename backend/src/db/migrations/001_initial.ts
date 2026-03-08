// @ts-ignore: IDE fails to resolve module under moduleResolution: "node" but it works in TSX at runtime.
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
    pgm.sql(`
-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Organisations (multi-tenant boundary)
CREATE TABLE organisations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT NOT NULL,
    slug                    TEXT UNIQUE NOT NULL,
    data_residency_region   TEXT,
    max_storage_bytes       BIGINT NOT NULL DEFAULT 107374182400, -- 100GB
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    email             TEXT UNIQUE NOT NULL,
    password_hash     TEXT NOT NULL,
    full_name         TEXT NOT NULL,
    role              TEXT NOT NULL CHECK (role IN ('admin', 'investigator', 'reviewer')),
    is_active         BOOLEAN NOT NULL DEFAULT true,
    mfa_secret        TEXT,           -- AES-256-GCM encrypted TOTP secret
    mfa_enabled       BOOLEAN NOT NULL DEFAULT false,
    mfa_backup_codes  TEXT[],         -- bcrypt hashed backup codes
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cases
CREATE TABLE cases (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    reference_id      TEXT UNIQUE NOT NULL,   -- e.g. ARIA-2026-0001
    title             TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','ingesting','queued','analysing','complete','error')),
    created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    metadata          JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ          -- Soft delete
);

-- Artifacts
CREATE TABLE artifacts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    filename          TEXT NOT NULL,        -- Original filename (display only, sanitized)
    s3_key            TEXT NOT NULL,        -- System-generated storage key
    file_format       TEXT NOT NULL CHECK (file_format IN ('evtx','pcap','csv','json')),
    file_size_bytes   BIGINT NOT NULL,
    sha256_hash       TEXT NOT NULL,        -- Verified on ingest
    ingest_status     TEXT NOT NULL DEFAULT 'pending'
                      CHECK (ingest_status IN ('pending','uploading','valid','error')),
    ingest_error      TEXT,
    uploaded_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Analysis Jobs
CREATE TABLE analysis_jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','complete','failed')),
    engine_version    TEXT,
    engine_git_sha    TEXT,
    queued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    error_message     TEXT,
    worker_id         TEXT,
    created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

-- Analysis Results
CREATE TABLE analysis_results (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id                      UUID NOT NULL UNIQUE REFERENCES analysis_jobs(id) ON DELETE RESTRICT,
    case_id                     UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    organisation_id             UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    human_attribution_score     SMALLINT NOT NULL CHECK (human_attribution_score BETWEEN 0 AND 100),
    confidence_interval_low     SMALLINT NOT NULL CHECK (confidence_interval_low BETWEEN 0 AND 100),
    confidence_interval_high    SMALLINT NOT NULL CHECK (confidence_interval_high BETWEEN 0 AND 100),
    mimicry_flag                BOOLEAN NOT NULL DEFAULT false,
    dimension_scores            JSONB NOT NULL,       -- Array of DimensionScore objects
    insufficient_data_dimensions TEXT[] NOT NULL DEFAULT '{}',
    agent_profile_notes         TEXT,
    session_breakdown           JSONB,               -- Mixed-actor spectrum breakdown
    engine_manifest             JSONB,               -- Full EngineManifest for reproducibility
    executive_summary           TEXT,                -- Plain-language summary
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reports
CREATE TABLE reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    organisation_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    analysis_result_id  UUID NOT NULL REFERENCES analysis_results(id) ON DELETE RESTRICT,
    version             SMALLINT NOT NULL DEFAULT 1,
    s3_key              TEXT NOT NULL,
    sha256_hash         TEXT NOT NULL,        -- Chain-of-custody hash of PDF bytes
    generated_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_locked           BOOLEAN NOT NULL DEFAULT true
);

-- Report Annotations
CREATE TABLE report_annotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id       UUID NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    section_key     TEXT NOT NULL,
    body            TEXT NOT NULL,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Events (APPEND-ONLY — immutability enforced via trigger)
CREATE TABLE audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID REFERENCES organisations(id),
    actor_id        UUID REFERENCES users(id),  -- NULL for system events
    event_type      TEXT NOT NULL,               -- e.g. CASE_CREATED, REPORT_EXPORTED
    entity_type     TEXT NOT NULL,               -- e.g. case, report, artifact
    entity_id       UUID NOT NULL,
    payload         JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pending Jobs (Transactional Outbox Pattern)
CREATE TABLE pending_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type        TEXT NOT NULL CHECK (job_type IN ('analysis', 'pdf_generation')),
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'dispatched', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at   TIMESTAMPTZ,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT
);

-- Refresh Tokens
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_cases_org_created       ON cases(organisation_id, created_at DESC);
CREATE INDEX idx_cases_created_by        ON cases(created_by);
CREATE INDEX idx_cases_status            ON cases(organisation_id, status);
CREATE INDEX idx_artifacts_case          ON artifacts(case_id);
CREATE INDEX idx_analysis_jobs_case      ON analysis_jobs(case_id, status);
CREATE INDEX idx_analysis_results_case   ON analysis_results(case_id);
CREATE INDEX idx_reports_case_version    ON reports(case_id, version DESC);
CREATE INDEX idx_audit_entity            ON audit_events(entity_id, created_at DESC);
CREATE INDEX idx_audit_actor             ON audit_events(actor_id, created_at DESC);
CREATE INDEX idx_audit_org               ON audit_events(organisation_id, created_at DESC);
CREATE INDEX idx_pending_jobs_status     ON pending_jobs(status, created_at ASC);
CREATE INDEX idx_refresh_tokens_user     ON refresh_tokens(user_id);
CREATE INDEX idx_users_org               ON users(organisation_id);

-- ============================================================================
-- TRIGGERS: updated_at auto-update
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_organisations BEFORE UPDATE ON organisations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_cases BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_annotations BEFORE UPDATE ON report_annotations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================================
-- TRIGGER: audit_events immutability — NO UPDATE or DELETE allowed
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events table is append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_audit_events_update
    BEFORE UPDATE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER immutable_audit_events_delete
    BEFORE DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- ============================================================================
-- TRIGGER: reports immutability — locked reports cannot be modified
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_locked_report_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_locked = true THEN
        RAISE EXCEPTION 'Locked reports are immutable. Create a new version instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_locked_reports
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION prevent_locked_report_mutation();

-- ============================================================================
-- SEED: Default organisation and admin user for development
-- Password: AriaAdmin2026! (bcrypt hash)
-- ============================================================================
INSERT INTO organisations (id, name, slug) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'ARIA Development Org', 'aria-dev');

INSERT INTO users (id, organisation_id, email, password_hash, full_name, role) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
     'admin@aria.dev', '$2a$10$jo5QtzCbSe1QVItVrFYYWueSSobgsMp2ebXddJU1f2.5O36v9i5qfa',
     'ARIA Admin', 'admin'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
     'investigator@aria.dev', '$2a$10$jo5QtzCbSe1QVItVrFYYWueSSobgsMp2ebXddJU1f2.5O36v9i5qfa',
     'Jane Investigator', 'investigator'),
    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'reviewer@aria.dev', '$2a$10$jo5QtzCbSe1QVItVrFYYWueSSobgsMp2ebXddJU1f2.5O36v9i5qfa',
     'John Reviewer', 'reviewer');
    `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
    pgm.sql(`
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS pending_jobs CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS report_annotations CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS analysis_results CASCADE;
DROP TABLE IF EXISTS analysis_jobs CASCADE;
DROP TABLE IF EXISTS artifacts CASCADE;
DROP TABLE IF EXISTS cases CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organisations CASCADE;

DROP FUNCTION IF EXISTS trigger_set_updated_at CASCADE;
DROP FUNCTION IF EXISTS prevent_audit_mutation CASCADE;
DROP FUNCTION IF EXISTS prevent_locked_report_mutation CASCADE;
    `);
}
