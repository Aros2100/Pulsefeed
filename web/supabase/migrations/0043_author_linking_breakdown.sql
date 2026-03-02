ALTER TABLE public.author_linking_logs
  ADD COLUMN new_authors integer NOT NULL DEFAULT 0,
  ADD COLUMN duplicates  integer NOT NULL DEFAULT 0,
  ADD COLUMN rejected    integer NOT NULL DEFAULT 0;
