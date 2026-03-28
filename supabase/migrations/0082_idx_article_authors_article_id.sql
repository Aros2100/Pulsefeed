-- Add index on article_authors(article_id) to speed up NOT EXISTS / NOT IN lookups.
-- Without this index, count_unlinked_articles() does a full seq-scan on article_authors
-- for every row in articles, causing statement timeouts on the status endpoint.

CREATE INDEX IF NOT EXISTS idx_article_authors_article_id
  ON public.article_authors(article_id);
