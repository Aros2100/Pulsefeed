ALTER TABLE public.lab_decisions
  ADD COLUMN IF NOT EXISTS ai_reasoning text;
