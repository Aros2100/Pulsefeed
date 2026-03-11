ALTER TABLE articles
  ADD COLUMN article_regions TEXT[] DEFAULT '{}',
  ADD COLUMN article_countries TEXT[] DEFAULT '{}',
  ADD COLUMN article_cities TEXT[] DEFAULT '{}',
  ADD COLUMN article_institutions TEXT[] DEFAULT '{}';

CREATE INDEX idx_articles_article_regions ON articles USING GIN(article_regions);
CREATE INDEX idx_articles_article_countries ON articles USING GIN(article_countries);
CREATE INDEX idx_articles_article_cities ON articles USING GIN(article_cities);
CREATE INDEX idx_articles_article_institutions ON articles USING GIN(article_institutions);
