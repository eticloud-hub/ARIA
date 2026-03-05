-- ============================================================================
-- ARIA — Migration 007: Enforce One Active Analysis Job Per Case
-- ============================================================================
-- Problem:  The "one running job per case" check is currently app-level only:
--
--     const existing = await repo.findRunningJobs(caseId);
--     if (existing.length > 0) throw new AnalysisAlreadyRunningError();
--
--           Under concurrency, two requests can both read 0 running jobs
--           and both INSERT a new queued job — violating the invariant.
--
-- Fix:     Unique partial index on (case_id) WHERE status IN ('queued','running').
--           PostgreSQL enforces at most ONE row per case_id with an active status.
--           Second concurrent INSERT gets a unique constraint violation.
--
-- Impact:  Race condition is now impossible regardless of app-level checks.
--          The app-level check remains as a fast-path (avoids hitting the DB
--          constraint), but the database is the source of truth.
-- ============================================================================

BEGIN;

CREATE UNIQUE INDEX idx_analysis_jobs_one_active
    ON analysis_jobs (case_id)
    WHERE status IN ('queued', 'running');

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
-- 1. Confirm index exists:
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE indexname = 'idx_analysis_jobs_one_active';
--
-- 2. Test enforcement (should fail on second INSERT):
--    INSERT INTO analysis_jobs (case_id, organisation_id, status, created_by)
--    VALUES ('test-case-id', 'test-org-id', 'queued', 'test-user-id');
--    -- OK
--
--    INSERT INTO analysis_jobs (case_id, organisation_id, status, created_by)
--    VALUES ('test-case-id', 'test-org-id', 'queued', 'test-user-id');
--    -- ERROR: duplicate key value violates unique constraint "idx_analysis_jobs_one_active"
--
-- 3. Completed/failed jobs should NOT block new ones:
--    UPDATE analysis_jobs SET status = 'complete' WHERE case_id = 'test-case-id';
--    INSERT INTO analysis_jobs (case_id, organisation_id, status, created_by)
--    VALUES ('test-case-id', 'test-org-id', 'queued', 'test-user-id');
--    -- OK — the partial index only covers 'queued' and 'running'
