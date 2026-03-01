-- Add ai_decision to articles (what the AI recommended before user review)
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS ai_decision TEXT;

-- Add ai_decision + ai_confidence snapshot to lab_decisions
ALTER TABLE public.lab_decisions
  ADD COLUMN IF NOT EXISTS ai_decision TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence INTEGER CHECK (ai_confidence >= 0 AND ai_confidence <= 100);
