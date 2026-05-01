-- Lab table for the Klasse B 1000-article parser test run.
-- Mirrors geo_parser_run_1000 in spirit but is dedicated to multi-address
-- (semicolon) affiliations. Detailed address rows go to geo_addresses_lab.

CREATE TABLE public.geo_parser_b_run_1000 (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pubmed_id     text NOT NULL UNIQUE,
  affiliation   text NOT NULL,

  -- Populated after parser run
  parser_run_at  timestamptz,
  num_addresses  smallint,
  parser_status  text CHECK (parser_status IN ('pending', 'parsed', 'rejected', 'error')),
  parser_error   text,

  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_geo_parser_b_run_status ON public.geo_parser_b_run_1000 (parser_status);

ALTER TABLE public.geo_parser_b_run_1000 ENABLE ROW LEVEL SECURITY;

-- Server-side only
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.geo_parser_b_run_1000 FROM anon, authenticated;
