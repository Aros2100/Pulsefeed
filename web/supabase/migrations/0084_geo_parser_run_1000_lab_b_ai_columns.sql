-- Add Klasse B AI-result columns to geo_parser_run_1000.
-- Populated by scripts/test-class-b-ai.ts using the existing Klasse A prompt.

ALTER TABLE public.geo_parser_run_1000
  ADD COLUMN IF NOT EXISTS lab_b_ai_department          text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_department2         text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_department3         text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_departments_overflow text[],
  ADD COLUMN IF NOT EXISTS lab_b_ai_institution         text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_institution2        text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_institution3        text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_institutions_overflow text[],
  ADD COLUMN IF NOT EXISTS lab_b_ai_city                text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_state               text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_country             text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_confidence          text,
  ADD COLUMN IF NOT EXISTS lab_b_ai_changes             text[],
  ADD COLUMN IF NOT EXISTS lab_b_ai_processed_at        timestamptz;
