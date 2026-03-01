-- Add model_version to lab_decisions for per-version accuracy tracking
ALTER TABLE public.lab_decisions ADD COLUMN IF NOT EXISTS model_version TEXT;

-- Backfill from articles where article_id is known and article has a model_version set
UPDATE public.lab_decisions ld
SET model_version = a.model_version
FROM public.articles a
WHERE ld.article_id = a.id
  AND ld.model_version IS NULL
  AND a.model_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS lab_decisions_model_version_idx ON public.lab_decisions (model_version);

NOTIFY pgrst, 'reload schema';
