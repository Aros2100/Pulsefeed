-- Return type changes require DROP before CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.get_article_type_candidates(integer, integer);

CREATE OR REPLACE FUNCTION public.get_article_type_candidates(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, publication_types text[])
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT a.id, a.publication_types
  FROM articles a
  JOIN article_specialties s ON s.article_id = a.id
  WHERE s.specialty_match = true
    AND (
      a.article_type_scored_at IS NULL
      OR a.article_type_model_version = 'deterministic-v1'
    )
    AND a.article_type_validated = false
    AND (a.abstract IS NOT NULL AND a.abstract != '')
  ORDER BY a.circle DESC NULLS LAST, a.imported_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
