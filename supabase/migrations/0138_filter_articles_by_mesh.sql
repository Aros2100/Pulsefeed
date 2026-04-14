CREATE OR REPLACE FUNCTION filter_articles_by_mesh(p_descriptor text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM articles
  WHERE mesh_terms @> jsonb_build_array(jsonb_build_object('descriptor', p_descriptor));
$$;
