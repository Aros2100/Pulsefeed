ALTER TABLE public.circle_2_sources
  ADD COLUMN IF NOT EXISTS max_results INT DEFAULT 100 CHECK (max_results >= 1 AND max_results <= 10000);
