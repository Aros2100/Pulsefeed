ALTER TABLE scoring_batches
  ADD COLUMN IF NOT EXISTS run_kind text;

ALTER TABLE scoring_runs
  ADD COLUMN IF NOT EXISTS run_kind text;

ALTER TABLE scoring_batches
  ADD CONSTRAINT scoring_batches_run_kind_check
  CHECK (run_kind IS NULL OR run_kind IN ('new', 'rescore'));

ALTER TABLE scoring_runs
  ADD CONSTRAINT scoring_runs_run_kind_check
  CHECK (run_kind IS NULL OR run_kind IN ('new', 'rescore'));

COMMENT ON COLUMN scoring_batches.run_kind IS 'Whether this batch scored never-before-scored articles (new) or re-scored articles whose source data changed (rescore). NULL for historic rows.';
COMMENT ON COLUMN scoring_runs.run_kind IS 'Whether this run scored new or rescore candidates. NULL for historic rows.';
