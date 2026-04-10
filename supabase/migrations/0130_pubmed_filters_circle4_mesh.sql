-- Add mesh_list column to pubmed_filters for C4 MeSH-based imports
ALTER TABLE public.pubmed_filters
  ADD COLUMN IF NOT EXISTS mesh_list text[];

-- Widen circle constraint on pubmed_filters to allow circle = 4
ALTER TABLE public.pubmed_filters
  DROP CONSTRAINT IF EXISTS pubmed_filters_circle_check;
ALTER TABLE public.pubmed_filters
  ADD CONSTRAINT pubmed_filters_circle_check CHECK (circle IN (1, 2, 4));

-- Widen circle constraint on articles to allow circle = 4
ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS articles_circle_check;
ALTER TABLE public.articles
  ADD CONSTRAINT articles_circle_check CHECK (circle IN (1, 2, 3, 4));
