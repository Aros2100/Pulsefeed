-- Match the style of count_articles_without_authors (which runs in ~380ms):
-- no STABLE, explicit set search_path = public.

CREATE OR REPLACE FUNCTION public.count_unlinked_articles()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM articles a
  WHERE NOT EXISTS (
    SELECT 1 FROM article_authors aa WHERE aa.article_id = a.id
  )
    AND a.circle IN (1, 2, 3);
$$;
