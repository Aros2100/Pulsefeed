CREATE TABLE public.ror_institutions (
  ror_id        TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT,
  state         TEXT,
  country       TEXT,
  country_code  TEXT,
  institution_type TEXT,
  status        TEXT,
  dump_version  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ror_institutions_country_code_idx ON public.ror_institutions (country_code);
CREATE INDEX ror_institutions_name_idx         ON public.ror_institutions USING gin (to_tsvector('english', name));

ALTER TABLE public.ror_institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read ror_institutions"
  ON public.ror_institutions FOR SELECT TO authenticated USING (true);
