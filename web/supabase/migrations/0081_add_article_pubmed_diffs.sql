-- Migration 0081: article_pubmed_diffs
-- Logs field-level divergences between article_pubmed_raw and articles table

CREATE TABLE public.article_pubmed_diffs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  raw_id          uuid NOT NULL REFERENCES public.article_pubmed_raw(id) ON DELETE CASCADE,
  field           text NOT NULL,
  db_value        text,
  xml_value       text,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  resolution      text NOT NULL DEFAULT 'pending'
                    CHECK (resolution IN ('pending', 'accepted', 'rejected', 'fixed')),
  resolved_at     timestamptz,
  resolved_by     text
);

CREATE INDEX idx_article_pubmed_diffs_article
  ON public.article_pubmed_diffs (article_id, detected_at DESC);

CREATE INDEX idx_article_pubmed_diffs_pending
  ON public.article_pubmed_diffs (resolution, detected_at DESC)
  WHERE resolution = 'pending';

-- RLS: server-side only (admin client / service role)
ALTER TABLE public.article_pubmed_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "article_pubmed_diffs_authenticated_select"
  ON public.article_pubmed_diffs FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.article_pubmed_diffs FROM anon, authenticated;
