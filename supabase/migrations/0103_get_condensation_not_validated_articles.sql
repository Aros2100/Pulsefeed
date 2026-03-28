DROP FUNCTION IF EXISTS get_condensation_not_validated_articles(text, int);

CREATE OR REPLACE FUNCTION get_condensation_not_validated_articles(
  p_specialty text,
  p_limit     int DEFAULT 100
)
RETURNS TABLE (
  id                      uuid,
  title                   text,
  journal_abbr            text,
  journal_title           text,
  published_date          date,
  abstract                text,
  pubmed_id               text,
  authors                 jsonb,
  short_headline          text,
  short_resume            text,
  bottom_line             text,
  condensed_model_version text
)
LANGUAGE sql
STABLE
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
    a.short_headline,
    a.short_resume,
    a.bottom_line,
    a.condensed_model_version
  FROM articles a
  WHERE
    -- Only articles tagged for this specialty
    p_specialty = ANY(a.specialty_tags)
    -- Only approved articles
    AND a.status = 'approved'
    -- Only articles that have been condensed
    AND a.short_headline IS NOT NULL
    AND a.short_resume   IS NOT NULL
    AND a.bottom_line    IS NOT NULL
    -- Exclude articles already validated in this module
    AND NOT EXISTS (
      SELECT 1
      FROM lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.module = 'condensation_text'
    )
  ORDER BY a.published_date DESC NULLS LAST
  LIMIT p_limit;
$$;
