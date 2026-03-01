-- Track whether a prompt version was created manually or auto-generated
ALTER TABLE public.model_versions ADD COLUMN IF NOT EXISTS generated_by TEXT NOT NULL DEFAULT 'manual';

NOTIFY pgrst, 'reload schema';
