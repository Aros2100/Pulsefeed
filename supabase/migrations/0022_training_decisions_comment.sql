ALTER TABLE public.lab_decisions
  ADD COLUMN IF NOT EXISTS disagreement_comment TEXT;
