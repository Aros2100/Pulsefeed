-- Grant read access to pg_cron tables so get_nightly_flow_report()
-- can populate Tier 9 (scoring-batch-poll, scoring-batch-ingest).
GRANT USAGE  ON SCHEMA cron             TO authenticated;
GRANT SELECT ON cron.job                TO authenticated;
GRANT SELECT ON cron.job_run_details    TO authenticated;
