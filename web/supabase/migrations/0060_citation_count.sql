ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS citation_count      int,
  ADD COLUMN IF NOT EXISTS citations_fetched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_articles_citation_count
  ON articles (citation_count DESC NULLS LAST);
