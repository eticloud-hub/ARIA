-- ============================================================================
-- ARIA — Migration 004: Optimize Transactional Outbox (pending_jobs)
-- ============================================================================
-- Problem:  idx_pending_jobs_status indexes ALL rows (pending + dispatched).
--           99.9% of rows are 'dispatched' — dead weight in the B-tree.
--           The FOR UPDATE SKIP LOCKED query scans thousands of irrelevant rows
--           to find the ~10 actually pending ones.
--
-- Fix:
--   1. Drop the full index
--   2. Create a partial index on ONLY pending rows
--   3. Schedule daily cleanup of old dispatched rows via pg_cron
--
-- Impact:  Outbox poll query goes from O(table_size) → O(pending_count).
--          At 1M rows/year, this is the difference between scanning 999,990
--          dispatched rows vs. scanning only the 10 pending ones.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Drop the existing full index
-- ============================================================================
-- This index covers ALL statuses — wasteful for a query that only cares
-- about 'pending' rows (which are typically <0.1% of the table).

DROP INDEX IF EXISTS idx_pending_jobs_status;

-- ============================================================================
-- Step 2: Create partial index — ONLY indexes 'pending' rows
-- ============================================================================
-- The outbox poller query is:
--   SELECT * FROM pending_jobs
--   WHERE status = 'pending'
--   ORDER BY created_at ASC
--   LIMIT 10
--   FOR UPDATE SKIP LOCKED
--
-- This partial index contains ONLY the rows that match status = 'pending'.
-- As rows transition to 'dispatched', they are automatically removed from
-- this index. The index stays tiny regardless of total table size.

CREATE INDEX idx_pending_jobs_pending
    ON pending_jobs (created_at ASC)
    WHERE status = 'pending';

COMMIT;

-- ============================================================================
-- Step 3: Daily cleanup of stale dispatched rows via pg_cron
-- ============================================================================
-- Rows with status = 'dispatched' that are >7 days old serve no purpose.
-- Keeping them bloats the table and slows sequential scans / VACUUM.
--
-- Prerequisite: CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- Schedule: every day at 03:00 UTC (off-peak)
/*
SELECT cron.schedule(
    'cleanup_dispatched_outbox_jobs',
    '0 3 * * *',
    $$
    WITH deleted AS (
        DELETE FROM pending_jobs
        WHERE status = 'dispatched'
          AND dispatched_at < now() - INTERVAL '7 days'
        RETURNING id
    )
    SELECT count(*) AS purged_count FROM deleted;
    $$
);
*/

-- To verify the cron job was registered:
--   SELECT * FROM cron.job WHERE jobname = 'cleanup_dispatched_outbox_jobs';
--
-- To run it manually for testing:
--   DELETE FROM pending_jobs
--   WHERE status = 'dispatched'
--     AND dispatched_at < now() - INTERVAL '7 days';
--
-- To check how many stale rows exist before first run:
--   SELECT count(*) FROM pending_jobs
--   WHERE status = 'dispatched'
--     AND dispatched_at < now() - INTERVAL '7 days';
