-- Migration 0080: article_pubmed_raw + pubmed_raw_latest_at on articles
-- Raw PubMed XML storage for audit, diff-detection, and re-parsing

CREATE TABLE public.article_pubmed_raw (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  pubmed_id       text NOT NULL,
  raw_xml         text NOT NULL,
  raw_xml_hash    text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  fetch_source    text NOT NULL CHECK (fetch_source IN ('import', 'pubmed_sync', 'backfill', 'manual')),

  CONSTRAINT article_pubmed_raw_unique_per_article UNIQUE (article_id, raw_xml_hash)
);

CREATE INDEX idx_article_pubmed_raw_article_fetched
  ON public.article_pubmed_raw (article_id, fetched_at DESC);

CREATE INDEX idx_article_pubmed_raw_pubmed_fetched
  ON public.article_pubmed_raw (pubmed_id, fetched_at DESC);

ALTER TABLE public.articles ADD COLUMN pubmed_raw_latest_at timestamptz;

CREATE INDEX idx_articles_pubmed_raw_latest_at
  ON public.articles (pubmed_raw_latest_at NULLS FIRST);

-- RLS: server-side only (admin client / service role)
ALTER TABLE public.article_pubmed_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "article_pubmed_raw_authenticated_select"
  ON public.article_pubmed_raw FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.article_pubmed_raw FROM anon, authenticated;
