CREATE TABLE public.geo_backfill_preview (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,

  -- Old values (from articles)
  old_geo_department text,
  old_geo_institution text,
  old_geo_city text,
  old_geo_state text,
  old_geo_country text,
  old_geo_region text,
  old_geo_continent text,
  old_geo_parser_confidence text,

  -- New values (computed, not written to articles)
  new_geo_department text,
  new_geo_institution text,
  new_geo_city text,
  new_geo_state text,
  new_geo_country text,
  new_geo_region text,
  new_geo_continent text,
  new_geo_source text,
  new_geo_parser_confidence text,

  -- Diagnostics
  had_openalex_cached boolean NOT NULL,
  openalex_fetched boolean NOT NULL,
  ror_lookup_attempted boolean NOT NULL,
  ror_lookup_succeeded boolean NOT NULL,
  parser_fallback_used boolean NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.geo_backfill_preview ENABLE ROW LEVEL SECURITY;
-- Server-side only (admin client bypasses RLS via service_role)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.geo_backfill_preview FROM anon, authenticated;
