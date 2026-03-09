-- Returns pending articles that have been scored (specialty_confidence IS NOT NULL)
-- but have NOT yet been validated (no lab_decision for module='specialty_tag').
-- Used by training/articles endpoint.
CREATE OR REPLACE FUNCTION public.get_scored_not_validated_articles(
  p_specialty text,
  p_limit     int DEFAULT 100
)
RETURNS TABLE(
  id                   uuid,
  title                text,
  journal_abbr         text,
  journal_title        text,
  published_date       date,
  abstract             text,
  pubmed_id            text,
  authors              jsonb,
  specialty_confidence int,
  ai_decision          text,
  circle               int
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
    a.specialty_confidence,
    a.ai_decision,
    a.circle
  FROM public.articles a
  WHERE a.status = 'pending'
    AND a.specialty_tags @> ARRAY[p_specialty]
    AND a.specialty_confidence IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty = p_specialty
        AND ld.module = 'specialty_tag'
    )
  ORDER BY a.specialty_scored_at ASC NULLS LAST
  LIMIT p_limit;
$$;

-- Counts pending articles that have been scored but not validated.
-- Used by score-batch to determine how many new articles to score.
CREATE OR REPLACE FUNCTION public.count_scored_not_validated(
  p_specialty text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)
  FROM public.articles a
  WHERE a.status = 'pending'
    AND a.specialty_tags @> ARRAY[p_specialty]
    AND a.specialty_confidence IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty = p_specialty
        AND ld.module = 'specialty_tag'
    );
$$;
