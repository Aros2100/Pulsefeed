ALTER TABLE public.pubmed_filters
  ADD COLUMN max_results INT NOT NULL DEFAULT 100;
