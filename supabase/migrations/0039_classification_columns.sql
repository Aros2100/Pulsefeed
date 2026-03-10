-- Classification enrichment columns on articles
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS subspecialty_ai              text,
  ADD COLUMN IF NOT EXISTS article_type_ai              text,
  ADD COLUMN IF NOT EXISTS study_design_ai              text,
  ADD COLUMN IF NOT EXISTS classification_reason        text,
  ADD COLUMN IF NOT EXISTS classification_scored_at     timestamptz,
  ADD COLUMN IF NOT EXISTS classification_model_version text;

-- Returns articles that have been classification-scored but NOT yet validated.
-- "Not validated" = has classification_scored_at but no lab_decision for
-- module='classification_subspecialty'. Since all 3 decisions are inserted
-- atomically, checking one module is sufficient.
CREATE OR REPLACE FUNCTION public.get_classification_not_validated_articles(
  p_specialty text,
  p_limit     int DEFAULT 100
)
RETURNS TABLE(
  id                           uuid,
  title                        text,
  journal_abbr                 text,
  journal_title                text,
  published_date               date,
  abstract                     text,
  pubmed_id                    text,
  authors                      jsonb,
  subspecialty_ai              text,
  article_type_ai              text,
  study_design_ai              text,
  classification_reason        text,
  classification_model_version text,
  circle                       int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    a.id,
    a.title,
    a.journal_abbr,
    a.journal_title,
    a.published_date,
    a.abstract,
    a.pubmed_id,
    a.authors,
    a.subspecialty_ai,
    a.article_type_ai,
    a.study_design_ai,
    a.classification_reason,
    a.classification_model_version,
    a.circle
  FROM public.articles a
  WHERE a.specialty_tags @> ARRAY[p_specialty]
    AND a.classification_scored_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty  = p_specialty
        AND ld.module     = 'classification_subspecialty'
    )
  ORDER BY a.classification_scored_at ASC NULLS LAST
  LIMIT p_limit;
$$;

-- Counts classification-scored but not-validated articles.
-- Used by score-classification to determine how many new articles to score.
CREATE OR REPLACE FUNCTION public.count_classification_not_validated(
  p_specialty text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)
  FROM public.articles a
  WHERE a.specialty_tags @> ARRAY[p_specialty]
    AND a.classification_scored_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty  = p_specialty
        AND ld.module     = 'classification_subspecialty'
    );
$$;
