-- Lab table for Klasse B one-to-many address model.
-- Each semicolon-separated address in a multi-address affiliation string
-- becomes its own row, keyed by (pubmed_id, position).

CREATE TABLE public.geo_addresses_lab (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pubmed_id     text NOT NULL,
  position      smallint NOT NULL,

  city          text,
  state         text,
  country       text,

  institution           text,
  institution2          text,
  institution3          text,
  institutions_overflow text[],

  department            text,
  department2           text,
  department3           text,
  departments_overflow  text[],

  confidence    text,
  created_at    timestamptz DEFAULT now(),

  UNIQUE (pubmed_id, position)
);

CREATE INDEX idx_geo_addresses_lab_pubmed_id ON public.geo_addresses_lab (pubmed_id);

ALTER TABLE public.geo_addresses_lab ENABLE ROW LEVEL SECURITY;

-- Server-side only (scripts use service_role which bypasses RLS)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.geo_addresses_lab FROM anon, authenticated;
