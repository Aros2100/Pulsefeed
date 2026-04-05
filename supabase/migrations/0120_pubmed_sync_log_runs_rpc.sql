CREATE OR REPLACE FUNCTION pubmed_sync_log_runs()
RETURNS TABLE (
  run_time  text,
  imported  bigint,
  updated   bigint,
  retracted bigint,
  total     bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('minute', synced_at), 'YYYY-MM-DD"T"HH24:MI') AS run_time,
    COUNT(*) FILTER (WHERE event = 'imported')  AS imported,
    COUNT(*) FILTER (WHERE event = 'updated')   AS updated,
    COUNT(*) FILTER (WHERE event = 'retracted') AS retracted,
    COUNT(*)                                    AS total
  FROM pubmed_sync_log
  GROUP BY DATE_TRUNC('minute', synced_at)
  ORDER BY DATE_TRUNC('minute', synced_at) DESC
  LIMIT 10;
$$;
