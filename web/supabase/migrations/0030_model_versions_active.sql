-- Add active flag to model_versions; only one row per specialty+module should be active at a time
ALTER TABLE public.model_versions ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT false;

-- Activate the most recently activated version for each specialty/module combination
WITH latest AS (
  SELECT DISTINCT ON (specialty, module) id
  FROM public.model_versions
  ORDER BY specialty, module, activated_at DESC
)
UPDATE public.model_versions SET active = true
WHERE id IN (SELECT id FROM latest);

NOTIFY pgrst, 'reload schema';
