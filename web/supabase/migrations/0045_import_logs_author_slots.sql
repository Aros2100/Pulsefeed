ALTER TABLE public.import_logs
  ADD COLUMN author_slots_imported integer NOT NULL DEFAULT 0;
