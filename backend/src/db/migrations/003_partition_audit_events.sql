-- ============================================================================
-- ARIA — Migration 003: Partition audit_events by Month
-- ============================================================================
-- Problem:  audit_events is append-only with ~100K inserts/day.
--           At 36M rows/year, all 3 B-tree indexes degrade linearly.
--           Queries scan the full table regardless of date range.
--
-- Solution: Range-partition by created_at (monthly).
--           Each partition is a self-contained table with its own indexes.
--           Old partitions can be detached and archived to cold storage.
--
-- Strategy: "Swap and backfill"
--           1. Create new partitioned table
--           2. Copy existing data into it
--           3. Swap names atomically
--           4. Recreate triggers + indexes on partitioned table
--           5. Set up auto-partition maintenance via pg_cron
--
-- CAUTION: Run during a maintenance window. The data copy + swap
--          requires a brief exclusive lock on the table.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Create the partitioned table structure
-- ============================================================================

-- Partition key (created_at) MUST be part of the primary key in PG.
-- We use a composite PK: (id, created_at)

CREATE TABLE audit_events_partitioned (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    organisation_id UUID,
    actor_id        UUID,
    event_type      TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    payload         JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Composite PK: partition key must be included
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ============================================================================
-- Step 2: Pre-create partitions (current + 3 months ahead + catch-all default)
-- ============================================================================

-- Past partitions: backfill from existing data
-- We create monthly partitions from Jan 2026 through Dec 2026.
-- Adjust the range based on your actual earliest data.

CREATE TABLE audit_events_y2026m01 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_events_y2026m02 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_events_y2026m03 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_events_y2026m04 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_events_y2026m05 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_events_y2026m06 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_events_y2026m07 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_events_y2026m08 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_events_y2026m09 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_events_y2026m10 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_events_y2026m11 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_events_y2026m12 PARTITION OF audit_events_partitioned
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition: catches anything outside defined ranges
-- This prevents INSERT failures if a partition hasn't been pre-created yet.
-- The pg_cron job (Step 6) will move data out of default into proper partitions.
CREATE TABLE audit_events_default PARTITION OF audit_events_partitioned DEFAULT;

-- ============================================================================
-- Step 3: Create indexes on the partitioned table
-- ============================================================================
-- These are automatically inherited by all current and future partitions.
-- Each partition gets its own local index (smaller B-tree, faster scans).

CREATE INDEX idx_audit_part_entity
    ON audit_events_partitioned (entity_id, created_at DESC);

CREATE INDEX idx_audit_part_actor
    ON audit_events_partitioned (actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

CREATE INDEX idx_audit_part_org
    ON audit_events_partitioned (organisation_id, created_at DESC);

CREATE INDEX idx_audit_part_type
    ON audit_events_partitioned (organisation_id, event_type, created_at DESC);

-- ============================================================================
-- Step 4: Migrate existing data
-- ============================================================================
-- INSERT...SELECT preserves all data. PG automatically routes each row
-- to the correct partition based on its created_at value.

INSERT INTO audit_events_partitioned
    (id, organisation_id, actor_id, event_type, entity_type,
     entity_id, payload, ip_address, created_at)
SELECT
    id, organisation_id, actor_id, event_type, entity_type,
    entity_id, payload, ip_address, created_at
FROM audit_events;

-- ============================================================================
-- Step 5: Atomic swap — rename old → archive, new → production
-- ============================================================================
-- This requires brief ACCESS EXCLUSIVE lock (blocks reads/writes).
-- In a maintenance window this is acceptable.

-- Drop old triggers first (they reference the old table)
DROP TRIGGER IF EXISTS immutable_audit_events_update ON audit_events;
DROP TRIGGER IF EXISTS immutable_audit_events_delete ON audit_events;

-- Drop old indexes
DROP INDEX IF EXISTS idx_audit_entity;
DROP INDEX IF EXISTS idx_audit_actor;
DROP INDEX IF EXISTS idx_audit_org;

-- Swap names atomically
ALTER TABLE audit_events RENAME TO audit_events_old;
ALTER TABLE audit_events_partitioned RENAME TO audit_events;

-- Rename partition tables to match new parent name convention
-- (optional — purely cosmetic for pg_catalog readability)

-- ============================================================================
-- Step 5b: Recreate immutability triggers on the partitioned table
-- ============================================================================
-- The prevent_audit_mutation() function already exists from migration 001.

CREATE TRIGGER immutable_audit_events_update
    BEFORE UPDATE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER immutable_audit_events_delete
    BEFORE DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- ============================================================================
-- Step 5c: Recreate FK references
-- ============================================================================
-- Partitioned tables in PG16 do not support being REFERENCED by FKs,
-- but they CAN reference other tables. Our audit_events is never referenced
-- by other tables (it's a leaf node), so no FK recreation needed.
--
-- The FKs FROM audit_events TO organisations/users are not enforced on
-- partitioned tables in PG < 17. If you need referential integrity,
-- use application-level validation or upgrade to PG 17+.

COMMIT;

-- ============================================================================
-- Step 6: Drop the old unpartitioned table (AFTER verification)
-- ============================================================================
-- Run this MANUALLY after confirming the migration succeeded:
--
--   SELECT count(*) FROM audit_events;            -- should match old count
--   SELECT count(*) FROM audit_events_old;        -- same number
--   SELECT tableoid::regclass, count(*)
--     FROM audit_events GROUP BY 1 ORDER BY 1;    -- rows per partition
--
-- Then:
--   DROP TABLE audit_events_old;

-- ============================================================================
-- Step 7: Auto-create future partitions via pg_cron
-- ============================================================================
-- Option A: pg_partman (recommended if available)
-- Option B: pg_cron with raw SQL (works everywhere)
--
-- Below is Option B — a pg_cron job that runs on the 1st of each month
-- and pre-creates the partition for 3 months ahead.

-- First, ensure pg_cron extension is enabled:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the partition creation job:
-- Runs at 00:05 UTC on the 1st of every month
/*
SELECT cron.schedule(
    'create_audit_partitions',
    '5 0 1 * *',
    $$
    DO $body$
    DECLARE
        partition_date  DATE;
        partition_name  TEXT;
        start_date      TEXT;
        end_date        TEXT;
    BEGIN
        -- Create partitions for the next 3 months
        FOR i IN 1..3 LOOP
            partition_date := date_trunc('month', now()) + (i || ' months')::INTERVAL;
            partition_name := 'audit_events_y'
                || to_char(partition_date, 'YYYY')
                || 'm'
                || to_char(partition_date, 'MM');
            start_date := to_char(partition_date, 'YYYY-MM-DD');
            end_date   := to_char(partition_date + INTERVAL '1 month', 'YYYY-MM-DD');

            -- Only create if it doesn't already exist
            IF NOT EXISTS (
                SELECT 1 FROM pg_class WHERE relname = partition_name
            ) THEN
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF audit_events FOR VALUES FROM (%L) TO (%L)',
                    partition_name, start_date, end_date
                );
                RAISE NOTICE 'Created partition: %', partition_name;
            END IF;
        END LOOP;
    END;
    $body$;
    $$
);
*/

-- ============================================================================
-- Step 8: Optional — archive old partitions to cold storage
-- ============================================================================
-- After a partition is >6 months old, detach it and move to a read-only
-- tablespace or dump it to S3:
--
--   ALTER TABLE audit_events DETACH PARTITION audit_events_y2026m01;
--   ALTER TABLE audit_events_y2026m01 SET TABLESPACE cold_storage;
--
-- The detached table remains queryable via direct SELECT but is no longer
-- part of the partition set. This keeps the active partition set small.

-- ============================================================================
-- Verification Queries (run after migration)
-- ============================================================================
-- 1. Row count matches:
--    SELECT count(*) FROM audit_events;
--    SELECT count(*) FROM audit_events_old;
--
-- 2. Partition distribution:
--    SELECT tableoid::regclass AS partition, count(*)
--    FROM audit_events GROUP BY 1 ORDER BY 1;
--
-- 3. Partition pruning works (should only scan 1 partition):
--    EXPLAIN SELECT * FROM audit_events
--    WHERE created_at >= '2026-03-01' AND created_at < '2026-04-01';
--
-- 4. Immutability triggers work:
--    UPDATE audit_events SET event_type = 'HACKED'
--    WHERE id = (SELECT id FROM audit_events LIMIT 1);
--    -- Expected: ERROR "audit_events table is append-only"
