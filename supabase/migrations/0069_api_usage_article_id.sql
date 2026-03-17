ALTER TABLE api_usage ADD COLUMN article_id uuid NULL REFERENCES articles(id) ON DELETE SET NULL;
CREATE INDEX idx_api_usage_article_id ON api_usage(article_id) WHERE article_id IS NOT NULL;
