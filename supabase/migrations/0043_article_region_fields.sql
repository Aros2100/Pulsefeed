ALTER TABLE articles
  ADD COLUMN first_author_region TEXT,
  ADD COLUMN last_author_region TEXT;

CREATE INDEX idx_articles_first_author_region ON articles(first_author_region);
CREATE INDEX idx_articles_last_author_region ON articles(last_author_region);
