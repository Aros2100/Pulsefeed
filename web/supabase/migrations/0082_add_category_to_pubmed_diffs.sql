-- Migration 0082: Add category column to article_pubmed_diffs

ALTER TABLE article_pubmed_diffs
ADD COLUMN category text;

ALTER TABLE article_pubmed_diffs
ADD CONSTRAINT article_pubmed_diffs_category_check
CHECK (category IS NULL OR category IN (
  'data_loss',
  'casing_only',
  'unicode_variant',
  'db_shorter_labels',
  'content_differs'
));

CREATE INDEX idx_article_pubmed_diffs_category
  ON article_pubmed_diffs (category, resolution)
  WHERE resolution = 'pending';
