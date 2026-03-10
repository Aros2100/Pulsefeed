-- Returns articles that have a condensation_text decision but NO condensation_pico decision.
-- These are articles where text has been validated but PICO still needs validation.
CREATE OR REPLACE FUNCTION public.get_pico_not_validated_articles(
  p_specialty text,
  p_limit     int DEFAULT 100
)
RETURNS TABLE(
  id                       uuid,
  title                    text,
  journal_abbr             text,
  journal_title            text,
  published_date           date,
  abstract                 text,
  pubmed_id                text,
  authors                  jsonb,
  pico_population          text,
  pico_intervention        text,
  pico_comparison          text,
  pico_outcome             text,
  sample_size              int,
  condensed_model_version  text
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
    a.pico_population,
    a.pico_intervention,
    a.pico_comparison,
    a.pico_outcome,
    a.sample_size,
    a.condensed_model_version
  FROM public.articles a
  WHERE a.specialty_tags @> ARRAY[p_specialty]
    AND a.condensed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty  = p_specialty
        AND ld.module     = 'condensation_text'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty  = p_specialty
        AND ld.module     = 'condensation_pico'
    )
  ORDER BY a.condensed_at ASC NULLS LAST
  LIMIT p_limit;
$$;

-- Counts articles with condensation_text decision but no condensation_pico decision.
CREATE OR REPLACE FUNCTION public.count_pico_not_validated(
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
    AND a.condensed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty  = p_specialty
        AND ld.module     = 'condensation_text'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty  = p_specialty
        AND ld.module     = 'condensation_pico'
    );
$$;
