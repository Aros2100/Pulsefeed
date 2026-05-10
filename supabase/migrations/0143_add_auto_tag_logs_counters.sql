ALTER TABLE auto_tag_logs
  ADD COLUMN IF NOT EXISTS evaluated integer,
  ADD COLUMN IF NOT EXISTS scored    integer,
  ADD COLUMN IF NOT EXISTS skipped   integer;

COMMENT ON COLUMN auto_tag_logs.evaluated IS 'Total candidates the rule engine considered. NULL for historic rows.';
COMMENT ON COLUMN auto_tag_logs.scored    IS 'Candidates the rule engine could classify (had a matching rule). NULL for historic rows or for the specialty job (concept does not apply).';
COMMENT ON COLUMN auto_tag_logs.skipped   IS 'Candidates the rule engine could not classify (no matching rule). NULL for historic rows or for the specialty job.';
