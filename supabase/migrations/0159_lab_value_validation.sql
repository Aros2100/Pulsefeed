-- Craft Validation Lab: three tables for scoring prompts against production-like articles
-- and comparing AI scores against human anchor comparisons.

-- ── 1. Frozen validation article pool ────────────────────────────────────────

CREATE TABLE public.lab_value_validation_articles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        uuid NOT NULL REFERENCES public.lab_modules(id),
  prod_article_id  uuid,
  pmid             text,
  title            text NOT NULL,
  abstract         text NOT NULL,
  article_type     text,
  journal          text,
  published_date   date,
  short_headline   text,
  resume           text,
  bottom_line      text,
  sari             jsonb,
  frozen_at        timestamptz NOT NULL DEFAULT now(),
  imported_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lab_value_validation_articles_module ON public.lab_value_validation_articles(module_id);
CREATE INDEX idx_lab_value_validation_articles_prod   ON public.lab_value_validation_articles(prod_article_id);

ALTER TABLE public.lab_value_validation_articles ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lab_value_validation_articles FROM anon, authenticated;

-- ── 2. Validation runs ────────────────────────────────────────────────────────

CREATE TABLE public.lab_value_validation_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    uuid NOT NULL REFERENCES public.lab_modules(id),
  prompt_id    uuid NOT NULL REFERENCES public.lab_value_prompts(id),
  n_articles   int  NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.lab_value_validation_runs ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lab_value_validation_runs FROM anon, authenticated;

-- ── 3. Per-item results and human validation ──────────────────────────────────

CREATE TABLE public.lab_value_validation_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES public.lab_value_validation_runs(id) ON DELETE CASCADE,
  validation_article_id uuid NOT NULL REFERENCES public.lab_value_validation_articles(id),
  craft_score           numeric,
  dimensions            jsonb,
  reasoning             text,
  scored_at             timestamptz,
  anchor_low_id         uuid REFERENCES public.lab_value_articles(id),
  anchor_same_id        uuid REFERENCES public.lab_value_articles(id),
  anchor_high_id        uuid REFERENCES public.lab_value_articles(id),
  choice_low            text,
  choice_same           text,
  choice_high           text,
  outcome               text,
  validated_at          timestamptz,
  UNIQUE (run_id, validation_article_id)
);

ALTER TABLE public.lab_value_validation_items ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lab_value_validation_items FROM anon, authenticated;

-- ── Mandatory RLS verification ────────────────────────────────────────────────
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'lab_value_validation_articles',
    'lab_value_validation_runs',
    'lab_value_validation_items'
  )
  AND rowsecurity = false;
-- must return 0 rows
