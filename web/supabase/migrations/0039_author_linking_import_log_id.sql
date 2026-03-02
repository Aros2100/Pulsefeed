ALTER TABLE public.author_linking_logs
  ADD COLUMN import_log_id uuid REFERENCES public.import_logs(id);
