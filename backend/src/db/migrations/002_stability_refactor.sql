-- ARIA — Migration 002: Stability Refactor
-- Fixes: Race-condition-safe reference IDs, JWT revocation, unique MFA salt

-- ============================================================================
-- 1. Case Reference ID Sequence (replaces COUNT(*)+1 race condition)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS case_ref_seq START WITH 1 INCREMENT BY 1;

-- Backfill: set sequence to max existing case count
DO $$
DECLARE
    max_count INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(SPLIT_PART(reference_id, '-', 3) AS INTEGER)
    ), 0) INTO max_count FROM cases;
    PERFORM setval('case_ref_seq', GREATEST(max_count, 1), true);
END $$;

-- ============================================================================
-- 2. Token Version (JWT revocation — increment to invalidate all tokens)
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- ============================================================================
-- 3. Unique MFA Salt (replaces hardcoded 'aria-mfa-salt')
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_salt TEXT;

-- Backfill existing MFA users with a random salt
-- (existing secrets will need re-encryption during next MFA setup)
UPDATE users SET mfa_salt = encode(gen_random_bytes(16), 'hex')
WHERE mfa_enabled = true AND mfa_salt IS NULL;
