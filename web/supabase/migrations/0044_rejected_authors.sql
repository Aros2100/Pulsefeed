CREATE TABLE public.rejected_authors (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id      UUID REFERENCES public.articles(id) ON DELETE CASCADE,
  pubmed_id       TEXT,
  position        INT,
  raw_data        JSONB,
  reason          TEXT,
  linking_log_id  UUID REFERENCES public.author_linking_logs(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rejected_authors_linking_log ON public.rejected_authors(linking_log_id);
CREATE INDEX idx_rejected_authors_article ON public.rejected_authors(article_id);

ALTER TABLE public.rejected_authors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service_role can access rejected_authors"
  ON public.rejected_authors FOR ALL
  USING (auth.role() = 'service_role');
