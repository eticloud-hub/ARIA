-- ============================================================================
-- ARIA — Migration 008: Normalize dimension_scores from JSONB to Table
-- ============================================================================
-- Problem:  analysis_results.dimension_scores is JSONB — an array of objects:
--           [{"dimension": "Temporal", "score": 85, "confidence": 0.92}, ...]
--
--           Legal teams need queries like:
--             "Show all cases where Temporal score > 80"
--             "Find cases with low confidence on any dimension"
--
--           JSONB cannot be indexed for these filtered queries without
--           GIN indexes + jsonpath, which are slow and non-obvious.
--
-- Fix:     Normalize into a relational join table with proper indexes.
--           JSONB column is kept (deprecated) for backward compatibility
--           during the transition period. Remove it in a future migration.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Create the normalized dimension_scores table
-- ============================================================================

CREATE TABLE dimension_scores (
    id          UUID NOT NULL DEFAULT gen_random_uuid(),
    result_id   UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
    dimension   TEXT NOT NULL,
    score       SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
    confidence  NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0.00 AND 1.00),

    -- Composite PK: one score per dimension per result
    PRIMARY KEY (result_id, dimension)
);

-- ============================================================================
-- Step 2: Filtering index — supports "find cases where Temporal > 80"
-- ============================================================================

CREATE INDEX idx_dim_scores_filter
    ON dimension_scores (dimension, score);

-- ============================================================================
-- Step 3: Backfill from existing JSONB data
-- ============================================================================
-- Extracts each element from the JSONB array and inserts as a row.
-- Handles the existing data structure: [{"dimension": "...", "score": N, ...}]

INSERT INTO dimension_scores (result_id, dimension, score, confidence)
SELECT
    ar.id AS result_id,
    elem->>'dimension' AS dimension,
    (elem->>'score')::SMALLINT AS score,
    COALESCE((elem->>'confidence')::NUMERIC(3,2), 0.00) AS confidence
FROM analysis_results ar,
     jsonb_array_elements(ar.dimension_scores) AS elem
WHERE ar.dimension_scores IS NOT NULL
  AND jsonb_typeof(ar.dimension_scores) = 'array';

COMMIT;

-- ============================================================================
-- Notes
-- ============================================================================
-- The original analysis_results.dimension_scores JSONB column is NOT dropped.
-- It remains for backward compatibility during the transition period.
--
-- To drop it later (once all read paths use the new table):
--   ALTER TABLE analysis_results DROP COLUMN dimension_scores;
--
-- Example queries enabled by this normalization:
--
-- Find all cases where Temporal score > 80:
--   SELECT ar.case_id, ds.score, ds.confidence
--   FROM dimension_scores ds
--   JOIN analysis_results ar ON ar.id = ds.result_id
--   WHERE ds.dimension = 'Temporal' AND ds.score > 80;
--
-- Find cases with low confidence on ANY dimension:
--   SELECT ar.case_id, ds.dimension, ds.confidence
--   FROM dimension_scores ds
--   JOIN analysis_results ar ON ar.id = ds.result_id
--   WHERE ds.confidence < 0.60;
--
-- Average score per dimension across all cases in an org:
--   SELECT ds.dimension, AVG(ds.score), AVG(ds.confidence)
--   FROM dimension_scores ds
--   JOIN analysis_results ar ON ar.id = ds.result_id
--   WHERE ar.organisation_id = $1
--   GROUP BY ds.dimension;

-- ============================================================================
-- Verification
-- ============================================================================
-- 1. Row count should equal total JSONB array elements:
--    SELECT count(*) FROM dimension_scores;
--    SELECT SUM(jsonb_array_length(dimension_scores))
--      FROM analysis_results WHERE dimension_scores IS NOT NULL;
--    -- Both should match
--
-- 2. Spot-check a result:
--    SELECT * FROM dimension_scores WHERE result_id = '<some-result-id>';
--
-- 3. Index is used for filtered queries:
--    EXPLAIN SELECT * FROM dimension_scores
--    WHERE dimension = 'Temporal' AND score > 80;
--    -- Should show "Index Scan using idx_dim_scores_filter"
