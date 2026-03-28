-- Use a capped subquery so Postgres stops after finding 1000 unlinked articles
-- instead of full-scanning the entire table. For the auto-chain logic (stop when 0)
-- and the KPI card (show ballpark count) a cap of 1000 is perfectly sufficient.

CREATE OR REPLACE FUNCTION count_unlinked_articles()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*) FROM (
    SELECT 1
    FROM articles a
    WHERE NOT EXISTS (
      SELECT 1 FROM article_authors aa WHERE aa.article_id = a.id
    )
      AND a.authors != '[]'::jsonb
      AND a.authors IS NOT NULL
      AND a.circle IN (1, 2, 3)
    LIMIT 1000
  ) sub;
$$;
