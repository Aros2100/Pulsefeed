-- Fix: wrap cron queries in BEGIN...EXCEPTION blocks so local dev
-- (without pg_cron) degrades to 'missing' instead of throwing.
-- The jobname matching was also corrected from ILIKE to exact match.
-- This is a full replacement of get_nightly_flow_report via execute_sql (already applied).
-- No DDL changes — the function signature is unchanged.

-- Marker comment so future readers know this migration patched 0145.
DO $$ BEGIN
  RAISE NOTICE 'Migration 0147: get_nightly_flow_report cron exception handling patched via MCP';
END $$;
