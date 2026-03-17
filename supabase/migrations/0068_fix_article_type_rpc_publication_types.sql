-- Fix: return publication_types as jsonb (matches actual column type returned by Supabase JS client)
-- Also adds mesh_terms and publication_types to the result set for the lab UI

DROP FUNCTION get_article_type_not_validated_articles(integer);

CREATE OR REPLACE FUNCTION get_article_type_not_validated_articles(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid, title text, journal_abbr text, journal_title text,
  published_date date, abstract text, pubmed_id text, authors jsonb,
  article_type_ai text, article_type_confidence integer,
  article_type_rationale text, article_type_model_version text, circle integer,
  mesh_terms jsonb, publication_types jsonb
)
LANGUAGE sql STABLE AS $fn$
  SELECT
    a.id, a.title, a.journal_abbr, a.journal_title,
    a.published_date, a.abstract, a.pubmed_id, a.authors,
    a.article_type_ai, a.article_type_confidence,
    a.article_type_rationale, a.article_type_model_version, a.circle,
    a.mesh_terms, a.publication_types
  FROM public.articles a
  WHERE a.status = 'approved'
    AND a.abstract IS NOT NULL
    AND a.article_type_scored_at IS NOT NULL
    AND (a.article_type_validated = false OR a.article_type_validated IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.module = 'article_type'
    )
  ORDER BY a.imported_at DESC
  LIMIT p_limit;
$fn$;
