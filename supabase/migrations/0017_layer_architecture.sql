-- Add circle to pubmed_filters (circle 1 = trusted journals)
ALTER TABLE public.pubmed_filters
  ADD COLUMN IF NOT EXISTS circle INT DEFAULT 1 CHECK (circle IN (1, 2));

-- New circle_2_sources table
CREATE TABLE public.circle_2_sources (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  specialty        TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('mesh', 'text', 'author', 'institution', 'citation', 'doi', 'keyword')),
  value            TEXT NOT NULL,
  description      TEXT,
  confidence_prior FLOAT DEFAULT 0.5,
  active           BOOLEAN DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Add circle, verified, source_id to articles
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS circle    INT DEFAULT 1 CHECK (circle IN (1, 2)),
  ADD COLUMN IF NOT EXISTS verified  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES circle_2_sources(id);
