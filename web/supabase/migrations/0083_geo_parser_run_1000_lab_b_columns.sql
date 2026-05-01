-- Add Klasse B columns to geo_parser_run_1000.
-- These are populated by scripts/test-class-b.ts using the Klasse B parser.

ALTER TABLE public.geo_parser_run_1000
  ADD COLUMN IF NOT EXISTS lab_b_class              char(1),
  ADD COLUMN IF NOT EXISTS lab_b_department          text,
  ADD COLUMN IF NOT EXISTS lab_b_department2         text,
  ADD COLUMN IF NOT EXISTS lab_b_department3         text,
  ADD COLUMN IF NOT EXISTS lab_b_departments_overflow text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lab_b_institution         text,
  ADD COLUMN IF NOT EXISTS lab_b_institution2        text,
  ADD COLUMN IF NOT EXISTS lab_b_institution3        text,
  ADD COLUMN IF NOT EXISTS lab_b_institutions_overflow text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lab_b_city                text,
  ADD COLUMN IF NOT EXISTS lab_b_state               text,
  ADD COLUMN IF NOT EXISTS lab_b_country             text,
  ADD COLUMN IF NOT EXISTS lab_b_confidence          text     CHECK (lab_b_confidence IN ('high', 'low') OR lab_b_confidence IS NULL),
  ADD COLUMN IF NOT EXISTS lab_b_parts_parsed        integer;
