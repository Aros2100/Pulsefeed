-- Returns article IDs matching ANY of the given MeSH descriptor names.
-- Used by articles/page.tsx to pre-filter before applying other query params.
CREATE OR REPLACE FUNCTION get_article_ids_for_mesh_terms(
  p_mesh_terms text[]
)
RETURNS TABLE (id uuid)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT a.id
  FROM articles a
  WHERE a.status = 'approved'
    AND (
      SELECT COUNT(DISTINCT t->>'descriptor')
      FROM jsonb_array_elements(a.mesh_terms) t
      WHERE t->>'descriptor' = ANY(p_mesh_terms)
    ) = array_length(p_mesh_terms, 1)
$$;

-- Returns count of approved articles matching a subspecialty + ALL of the given MeSH descriptors.
-- Used by /api/articles/mesh-count.
CREATE OR REPLACE FUNCTION count_articles_by_mesh_terms(
  p_subspecialty text,
  p_mesh_terms   text[]
)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT a.id)
  FROM articles a
  WHERE a.status = 'approved'
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(a.subspecialty_ai))
    AND (
      SELECT COUNT(DISTINCT t->>'descriptor')
      FROM jsonb_array_elements(a.mesh_terms) t
      WHERE t->>'descriptor' = ANY(p_mesh_terms)
    ) = array_length(p_mesh_terms, 1)
$$;
