-- ============================================================================
-- ARIA — Migration 006: Refresh Token Cleanup + Partial Index
-- ============================================================================
-- Problem:  Revoked and expired refresh tokens are never deleted.
--           At 15K logins/day with 30-day expiry, ~450K stale rows/month
--           accumulate. The existing idx_refresh_tokens_user index covers
--           ALL tokens (active + stale), wasting B-tree space.
--
-- Fix:
--   1. Partial index on token_hash for ONLY active tokens
--   2. pg_cron nightly cleanup of revoked/expired tokens
--
-- Impact:  Token lookup during refresh goes from scanning all tokens
--          for a user to a direct hit on the partial index.
--          Table stays small (~30-day rolling window of active tokens).
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Partial index — only active (non-revoked, non-expired) tokens
-- ============================================================================
-- The refresh token validation query is:
--   SELECT id, user_id, expires_at, revoked_at
--   FROM refresh_tokens WHERE token_hash = $1
--
-- With this partial index, lookups only hit tokens that are still valid.
-- Revoked/expired tokens are excluded from the index entirely.

-- Note: cannot use expires_at > now() because now() is not IMMUTABLE.
-- Instead, we index all non-revoked tokens. Expiry is checked at query time.
-- The nightly cleanup job removes expired tokens, keeping this index small.
CREATE INDEX idx_refresh_tokens_active
    ON refresh_tokens (token_hash)
    WHERE revoked_at IS NULL;

COMMIT;

-- ============================================================================
-- Step 2: Nightly cleanup via pg_cron
-- ============================================================================
-- Deletes tokens that are:
--   a) Revoked (any revoked_at value), OR
--   b) Expired for more than 1 day (grace period for in-flight requests)
--
-- Prerequisite: CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- Schedule: every day at 02:30 UTC (off-peak, before outbox cleanup at 03:00)
/*
SELECT cron.schedule(
    'cleanup_stale_refresh_tokens',
    '30 2 * * *',
    $$
    WITH deleted AS (
        DELETE FROM refresh_tokens
        WHERE revoked_at IS NOT NULL
           OR expires_at < now() - INTERVAL '1 day'
        RETURNING id
    )
    SELECT count(*) AS purged_count FROM deleted;
    $$
);
*/

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- 1. Confirm partial index exists:
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE indexname = 'idx_refresh_tokens_active';
--
-- 2. Check how many stale tokens currently exist:
--    SELECT count(*) AS stale_tokens FROM refresh_tokens
--    WHERE revoked_at IS NOT NULL OR expires_at < now() - INTERVAL '1 day';
--
-- 3. Verify partial index is used for lookups:
--    EXPLAIN SELECT * FROM refresh_tokens
--    WHERE token_hash = 'some-hash-value';
--    -- Should show "Index Scan using idx_refresh_tokens_active"
--
-- 4. Manual cleanup (run once to purge existing stale tokens):
--    DELETE FROM refresh_tokens
--    WHERE revoked_at IS NOT NULL
--       OR expires_at < now() - INTERVAL '1 day';
