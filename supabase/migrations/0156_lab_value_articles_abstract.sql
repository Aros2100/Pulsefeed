-- Add abstract to the frozen lab_value_articles snapshot. Scoring is now
-- evaluated on raw source data (abstract) rather than the AI-generated
-- summary fields (short_headline, resume, bottom_line, SARI). Those fields
-- remain on the table because the pairwise UI displays them to the clinician.

ALTER TABLE public.lab_value_articles
  ADD COLUMN abstract text;

-- Backfill from the production articles table
UPDATE public.lab_value_articles lva
SET abstract = art.abstract
FROM public.articles art
WHERE art.id = lva.prod_article_id
  AND lva.abstract IS NULL;
