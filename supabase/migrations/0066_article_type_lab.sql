-- Article type lab columns on articles
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS article_type_rationale        text,
  ADD COLUMN IF NOT EXISTS article_type_model_version    text,
  ADD COLUMN IF NOT EXISTS article_type_scored_at        timestamptz,
  ADD COLUMN IF NOT EXISTS article_type_confidence       int;

-- Returns articles that have been article-type-scored but NOT yet validated.
-- "Not validated" = has article_type_scored_at but no lab_decision for module='article_type'.
CREATE OR REPLACE FUNCTION public.get_article_type_not_validated_articles(
  p_limit int DEFAULT 100
)
RETURNS TABLE(
  id                        uuid,
  title                     text,
  journal_abbr              text,
  journal_title             text,
  published_date            date,
  abstract                  text,
  pubmed_id                 text,
  authors                   jsonb,
  mesh_terms                jsonb,
  publication_types         text[],
  article_type_ai           text,
  article_type_rationale    text,
  article_type_model_version text,
  article_type_confidence   int,
  circle                    int
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
    a.mesh_terms,
    a.publication_types,
    a.article_type_ai,
    a.article_type_rationale,
    a.article_type_model_version,
    a.article_type_confidence,
    a.circle
  FROM public.articles a
  WHERE a.status = 'approved'
    AND a.article_type_scored_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.module     = 'article_type'
    )
  ORDER BY a.article_type_scored_at ASC NULLS LAST
  LIMIT p_limit;
$$;

-- Counts article-type-scored but not-validated articles.
CREATE OR REPLACE FUNCTION public.count_article_type_not_validated()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)
  FROM public.articles a
  WHERE a.status = 'approved'
    AND a.article_type_scored_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.module     = 'article_type'
    );
$$;
