CREATE TABLE public.geo_fase0_parser_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL,
  run_name              text NOT NULL,
  run_notes             text,
  run_started_at        timestamptz NOT NULL,

  article_id            uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  pubmed_id             text NOT NULL,
  input_string          text NOT NULL,

  parsed_country        text,
  parsed_city           text,
  parsed_state          text,
  parsed_institution    text,
  parsed_department     text,
  parsed_confidence     text CHECK (parsed_confidence IN ('high', 'low') OR parsed_confidence IS NULL),

  parse_duration_ms     integer,
  parse_error           text,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fase0_parser_runs_run_id      ON public.geo_fase0_parser_runs(run_id);
CREATE INDEX idx_fase0_parser_runs_article     ON public.geo_fase0_parser_runs(article_id);
CREATE INDEX idx_fase0_parser_runs_run_started ON public.geo_fase0_parser_runs(run_started_at DESC);

ALTER TABLE public.geo_fase0_parser_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read"
  ON public.geo_fase0_parser_runs
  FOR SELECT
  TO authenticated
  USING (true);
