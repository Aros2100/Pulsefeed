CREATE OR REPLACE FUNCTION count_unlinked_articles()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)
  FROM articles
  WHERE id NOT IN (SELECT article_id FROM article_authors)
    AND authors != '[]'::jsonb
    AND circle = 1;
$$;

CREATE OR REPLACE FUNCTION fetch_unlinked_articles(p_offset int, p_limit int)
RETURNS TABLE(id uuid, pubmed_id text, authors jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id, pubmed_id, authors
  FROM articles
  WHERE id NOT IN (SELECT article_id FROM article_authors)
    AND authors != '[]'::jsonb
    AND circle = 1
  ORDER BY imported_at ASC
  LIMIT p_limit OFFSET p_offset;
$$;
