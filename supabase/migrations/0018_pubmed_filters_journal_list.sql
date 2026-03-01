ALTER TABLE public.pubmed_filters
  ADD COLUMN IF NOT EXISTS journal_list TEXT[] DEFAULT '{}';
