-- Rewrite count_unlinked_articles using NOT EXISTS instead of NOT IN.
-- NOT IN on large tables causes full sequential scans and hits statement timeouts.
-- NOT EXISTS uses an index-nested-loop join and is dramatically faster.

CREATE OR REPLACE FUNCTION count_unlinked_articles()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)
  FROM articles a
  WHERE NOT EXISTS (
    SELECT 1 FROM article_authors aa WHERE aa.article_id = a.id
  )
    AND a.authors != '[]'::jsonb
    AND a.authors IS NOT NULL
    AND a.circle IN (1, 2, 3);
$$;

