-- Replace UNIQUE (edition_id, article_id) with UNIQUE (edition_id, article_id, subspecialty)
-- so the same article can appear in multiple subspecialty sections of one edition.
ALTER TABLE public.newsletter_edition_articles
  DROP CONSTRAINT IF EXISTS newsletter_edition_articles_edition_id_article_id_key;

ALTER TABLE public.newsletter_edition_articles
  ADD CONSTRAINT newsletter_edition_articles_edition_id_article_id_subspecialty_key
  UNIQUE (edition_id, article_id, subspecialty);
