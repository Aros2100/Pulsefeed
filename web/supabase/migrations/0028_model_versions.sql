CREATE TABLE IF NOT EXISTS public.model_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty    TEXT NOT NULL,
  module       TEXT NOT NULL,
  version      TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  notes        TEXT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_model_versions_lookup
  ON public.model_versions (specialty, module, activated_at DESC);

-- Seed initial v1 prompt for neurosurgery / specialty_tag
INSERT INTO public.model_versions (specialty, module, version, prompt, notes)
VALUES (
  'neurosurgery',
  'specialty_tag',
  'v1',
  'You are an expert {specialty} physician evaluating research articles.
Assess whether this article is relevant to clinical {specialty} practice.

Respond with JSON only:
{"decision":"approved","confidence":85,"reasoning":"one sentence"}

Title: {title}
Abstract: {abstract}',
  'Initial version'
);
