CREATE OR REPLACE FUNCTION get_distinct_specialty_tags()
RETURNS TABLE(tag text)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT unnest(specialty_tags) AS tag
  FROM articles
  WHERE specialty_tags IS NOT NULL
  ORDER BY tag;
$$;
