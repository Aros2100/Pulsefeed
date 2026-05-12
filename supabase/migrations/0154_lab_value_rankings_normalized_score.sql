-- Adds a pre-computed 1-10 normalised score to each ranking row.
-- score = 1 + 9 * (beta - beta_min) / (beta_max - beta_min)
-- Computed alongside β when Bradley-Terry runs, stored for fast display
-- across the ranking table, quick-test preview, and evaluation disagreements.
-- NULL until the first Bradley-Terry computation after this migration.

ALTER TABLE public.lab_value_rankings
  ADD COLUMN normalized_score numeric;
