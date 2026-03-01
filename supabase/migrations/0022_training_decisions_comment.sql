ALTER TABLE public.training_decisions
  ADD COLUMN IF NOT EXISTS disagreement_comment TEXT;
