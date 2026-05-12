-- Tracks which Anthropic model produced each score, so quick test batches
-- run with different models can be compared without code changes.

ALTER TABLE public.lab_value_article_scores
  ADD COLUMN scoring_model text;
