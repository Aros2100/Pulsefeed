ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS authors_unresolvable boolean DEFAULT false;

DROP FUNCTION IF EXISTS fetch_unlinked_articles(int, int);
CREATE OR REPLACE FUNCTION fetch_unlinked_articles(p_offset int, p_limit int)
RETURNS TABLE(id uuid, pubmed_id text, doi text, authors jsonb)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, pubmed_id, doi, authors
  FROM articles
  WHERE id NOT IN (SELECT article_id FROM article_authors)
    AND authors != '[]'::jsonb
    AND circle IN (1, 2, 3, 4)
    AND (authors_unresolvable IS NULL OR authors_unresolvable = false)
  ORDER BY imported_at ASC
  LIMIT p_limit OFFSET p_offset;
$$;
