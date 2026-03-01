-- Replace articles table with full PubMed schema
-- Safe to run even if 0004 was already applied (DROP CASCADE removes old trigger too)

DROP TABLE IF EXISTS public.articles CASCADE;

CREATE TABLE public.articles (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pubmed_id         TEXT        NOT NULL UNIQUE,
  doi               TEXT,
  pmc_id            TEXT,
  title             TEXT        NOT NULL,
  abstract          TEXT,
  language          TEXT,
  publication_types TEXT[],
  mesh_terms        JSONB       NOT NULL DEFAULT '[]',
  keywords          TEXT[],
  coi_statement     TEXT,
  grants            JSONB       NOT NULL DEFAULT '[]',
  substances        JSONB       NOT NULL DEFAULT '[]',
  journal_abbr      TEXT,
  journal_title     TEXT,
  published_year    INT,
  date_completed    DATE,
  volume            TEXT,
  issue             TEXT,
  authors           JSONB       NOT NULL DEFAULT '[]',
  specialty_tags    TEXT[]      NOT NULL DEFAULT '{}',
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Enrichment fields (populated in a later flow)
  short_resume      TEXT,
  long_resume       TEXT,
  news_value        INT,
  subspecialty      TEXT,
  pico              JSONB,
  clinical_relevance TEXT,
  enriched_at       TIMESTAMPTZ
);

-- Merge specialty_tags on upsert so one article can belong to multiple specialties
CREATE OR REPLACE FUNCTION merge_article_specialty_tags()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.specialty_tags := (
    SELECT array_agg(DISTINCT t ORDER BY t)
    FROM unnest(COALESCE(OLD.specialty_tags, '{}') || NEW.specialty_tags) AS t
  );
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

-- service_role bypasses RLS for writes
