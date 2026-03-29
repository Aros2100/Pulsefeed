-- Returns distinct MeSH descriptors from articles.mesh_terms that match a query string.
-- mesh_terms is a JSONB array of { descriptor, major, qualifiers }.
CREATE OR REPLACE FUNCTION search_mesh_terms(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE(descriptor text)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT (mt->>'descriptor')
  FROM articles,
       jsonb_array_elements(mesh_terms) AS mt
  WHERE mt->>'descriptor' ILIKE '%' || p_query || '%'
  ORDER BY 1
  LIMIT p_limit;
$$;
