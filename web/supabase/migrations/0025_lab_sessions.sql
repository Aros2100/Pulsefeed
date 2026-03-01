-- Lab sessions: one row per "Bekræft & gem" click
CREATE TABLE IF NOT EXISTS public.lab_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty      TEXT NOT NULL,
  module         TEXT NOT NULL DEFAULT 'specialty_tag',
  editor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  total_reviewed INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0
);

-- Lab decisions: one row per article verdict within a session
CREATE TABLE IF NOT EXISTS public.lab_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES public.lab_sessions(id) ON DELETE CASCADE,
  article_id    UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  specialty     TEXT NOT NULL,
  module        TEXT NOT NULL DEFAULT 'specialty_tag',
  verdict       TEXT NOT NULL CHECK (verdict IN ('approved', 'rejected', 'unsure')),
  ai_confidence INTEGER CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS lab_decisions_specialty_module_idx
  ON public.lab_decisions (specialty, module);

CREATE INDEX IF NOT EXISTS lab_decisions_decided_at_idx
  ON public.lab_decisions (decided_at DESC);
