CREATE OR REPLACE FUNCTION get_specialty_article_stats(specialty_slug text)
RETURNS TABLE(circle integer, status text, antal bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT circle, status, COUNT(*) AS antal
  FROM articles
  WHERE specialty_tags @> ARRAY[specialty_slug]
  GROUP BY circle, status;
$$;
