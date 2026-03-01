-- ── articles ─────────────────────────────────────────────────────────────────

CREATE TABLE public.articles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pubmed_id       TEXT        NOT NULL UNIQUE,
  title           TEXT        NOT NULL,
  abstract        TEXT,
  authors         TEXT[]      NOT NULL DEFAULT '{}',
  journal         TEXT,
  published_date  DATE,
  specialty_tags  TEXT[]      NOT NULL DEFAULT '{}',
  doi             TEXT,
  url             TEXT        NOT NULL,
  -- AI enrichment fields (populated in a later flow)
  ai_summary      TEXT,
  ai_highlights   TEXT[],
  relevance_score FLOAT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merge specialty_tags on upsert so one article can belong to multiple specialties
CREATE OR REPLACE FUNCTION merge_article_specialty_tags()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.specialty_tags := (
    SELECT array_agg(DISTINCT t ORDER BY t)
    FROM unnest(COALESCE(OLD.specialty_tags, '{}') || NEW.specialty_tags) AS t
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER merge_article_specialty_tags
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION merge_article_specialty_tags();

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read articles
CREATE POLICY "articles: authenticated read" ON public.articles
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role can write (bypasses RLS entirely)


-- ── pubmed_filters ────────────────────────────────────────────────────────────

CREATE TABLE public.pubmed_filters (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  specialty    TEXT        NOT NULL,
  query_string TEXT        NOT NULL,
  active       BOOLEAN     NOT NULL DEFAULT true,
  last_run_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.pubmed_filters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.pubmed_filters ENABLE ROW LEVEL SECURITY;

-- Admins can manage filters
CREATE POLICY "pubmed_filters: admin all" ON public.pubmed_filters
  FOR ALL TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');


-- ── import_logs ───────────────────────────────────────────────────────────────

CREATE TABLE public.import_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_id         UUID        REFERENCES public.pubmed_filters(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  articles_imported INTEGER     NOT NULL DEFAULT 0,
  articles_skipped  INTEGER     NOT NULL DEFAULT 0,
  errors            JSONB,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read logs; service_role writes
CREATE POLICY "import_logs: admin read" ON public.import_logs
  FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
