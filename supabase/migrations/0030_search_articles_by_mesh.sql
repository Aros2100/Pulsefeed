-- Add a generated text column for MeSH term searching via PostgREST.
-- PostgREST cannot cast jsonb to text in filters, so we store a
-- pre-cast text version as a generated column.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS mesh_terms_text text
  GENERATED ALWAYS AS (mesh_terms::text) STORED;
