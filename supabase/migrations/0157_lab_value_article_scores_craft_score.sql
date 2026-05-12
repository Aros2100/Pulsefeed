-- The rubric-based prompt produces a weighted craft_score on a 20-100 scale.
-- That is the real output; the 1-10 score column kept by previous prompts is
-- a compressed mapping that loses information (ties on close pairs).
-- Store the craft_score directly. The 1-10 score column stays so existing
-- reads keep working; it's derived from craft_score on insert.

ALTER TABLE public.lab_value_article_scores
  ADD COLUMN craft_score numeric;
