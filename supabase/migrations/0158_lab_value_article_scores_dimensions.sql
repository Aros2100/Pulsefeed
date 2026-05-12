-- Per-dimension scorer (1-5 each) from the rubric prompt, stored so we can
-- analyse which dimensions the prompt consistently under- or over-scores.
-- Nullable: legacy scores without a dimensions block have null here.

ALTER TABLE public.lab_value_article_scores
  ADD COLUMN dimensions jsonb;
