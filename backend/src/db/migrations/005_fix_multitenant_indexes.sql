-- ============================================================================
-- ARIA — Migration 005: Fix Multi-Tenant Index Coverage
-- ============================================================================
-- Problem:  idx_artifacts_case and idx_analysis_results_case do NOT include
--           organisation_id as a leading column. In a multi-tenant system,
--           this means every org's data is interleaved in the B-tree.
--           Queries like:
--             SELECT * FROM artifacts WHERE case_id = $1 AND organisation_id = $2
--           do an index scan on (case_id) then RECHECK organisation_id,
--           instead of a direct tenant-scoped lookup.
--
-- Fix:
--   1. Drop old indexes without org scoping
--   2. Create new indexes with organisation_id as LEADING column
--   3. Add UNIQUE constraint on reports(case_id, version) to prevent
--      race conditions during concurrent report generation
--
-- Impact:  All per-tenant queries now do direct lookups instead of
--          scan + recheck. At 100 orgs × 2M artifacts, this eliminates
--          scanning 1.98M irrelevant rows per query.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Drop old non-tenant-scoped indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_artifacts_case;
DROP INDEX IF EXISTS idx_analysis_results_case;

-- ============================================================================
-- Step 2: Create tenant-scoped indexes (organisation_id leading)
-- ============================================================================

-- Artifacts: org first, then case, then most recent upload
-- Covers: SELECT * FROM artifacts WHERE organisation_id = $1 AND case_id = $2
--         ORDER BY uploaded_at DESC
CREATE INDEX idx_artifacts_case_org
    ON artifacts (organisation_id, case_id, uploaded_at DESC);

-- Analysis Results: org first, then case, then most recent result
-- Covers: SELECT * FROM analysis_results WHERE organisation_id = $1 AND case_id = $2
--         ORDER BY created_at DESC LIMIT 1
CREATE INDEX idx_analysis_results_case_org
    ON analysis_results (organisation_id, case_id, created_at DESC);

-- ============================================================================
-- Step 3: Composite UNIQUE constraint on reports(case_id, version)
-- ============================================================================
-- The current report version generation uses:
--   SELECT COALESCE(MAX(version), 0) + 1 FROM reports WHERE case_id = $1
--
-- Without a UNIQUE constraint, two concurrent requests can both read
-- MAX(version) = 3 and both INSERT version 4. The UNIQUE constraint
-- ensures one fails with a constraint violation instead of creating
-- a duplicate version — the application code can then retry.

ALTER TABLE reports
    ADD CONSTRAINT uq_report_case_version UNIQUE (case_id, version);

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- 1. Confirm new indexes exist:
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename IN ('artifacts', 'analysis_results');
--
-- 2. Confirm old indexes are gone:
--    SELECT indexname FROM pg_indexes
--    WHERE indexname IN ('idx_artifacts_case', 'idx_analysis_results_case');
--    -- Expected: 0 rows
--
-- 3. Confirm tenant isolation is enforced (should show "Index Scan" not "Recheck"):
--    EXPLAIN SELECT * FROM artifacts
--    WHERE organisation_id = 'a0000000-0000-0000-0000-000000000001'
--      AND case_id = 'some-case-id';
--
-- 4. Confirm unique constraint on reports:
--    SELECT conname, contype FROM pg_constraint
--    WHERE conname = 'uq_report_case_version';
--    -- Expected: 1 row with contype = 'u'
