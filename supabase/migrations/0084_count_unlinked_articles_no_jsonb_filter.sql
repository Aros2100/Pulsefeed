-- Remove the authors != '[]'::jsonb filter that breaks query planning.
-- The jsonb comparison prevents index usage and causes statement timeouts.
-- Articles with an empty authors array won't be linked anyway (the linker skips them),
-- so including them in the count is acceptable.

CREATE OR REPLACE FUNCTION count_unlinked_articles()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)
  FROM articles a
  WHERE NOT EXISTS (
    SELECT 1 FROM article_authors aa WHERE aa.article_id = a.id
  )
    AND a.circle IN (1, 2, 3);
$$;
