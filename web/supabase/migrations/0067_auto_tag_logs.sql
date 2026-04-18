CREATE TABLE public.auto_tag_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job          text        NOT NULL,
  status       text        NOT NULL DEFAULT 'completed',
  approved     integer     NOT NULL DEFAULT 0,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  errors       text[]
);

ALTER TABLE public.auto_tag_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read auto_tag_logs"
  ON public.auto_tag_logs FOR SELECT TO authenticated USING (true);
