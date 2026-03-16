ALTER TABLE public.author_linking_logs
  ADD COLUMN authors_processed integer NOT NULL DEFAULT 0;
