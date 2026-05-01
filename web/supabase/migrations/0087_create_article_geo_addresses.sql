-- Migration 0087: Create article_geo_addresses + extend article_geo_metadata
-- Production table for Klasse B multi-address geo data.
-- Klasse A flow (articles.geo_*) is untouched by this migration.

-- update_updated_at_column exists in storage schema only; create in public
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 1. article_geo_addresses ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS article_geo_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  position        smallint NOT NULL,

  -- Geo (5 niveauer)
  city            text,
  state           text,
  country         text,
  region          text,
  continent       text,

  -- Institutions 3+3+overflow
  institution             text,
  institution2            text,
  institution3            text,
  institutions_overflow   text[] NOT NULL DEFAULT '{}',

  -- Departments 3+3+overflow
  department              text,
  department2             text,
  department3             text,
  departments_overflow    text[] NOT NULL DEFAULT '{}',

  confidence      text,

  -- Per-row AI-spor
  ai_processed_at timestamptz,
  ai_changes      text[],
  ai_action       text,           -- 'kept' | 'merged' | 'split' | 'dropped' | 'new' | 'too_long'

  -- Berigelses-spor
  state_source    text,           -- 'parser' | 'ai' | 'enrichment' | 'manual'

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (article_id, position)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_article_geo_addresses_article_id
  ON article_geo_addresses(article_id);
CREATE INDEX IF NOT EXISTS idx_article_geo_addresses_country
  ON article_geo_addresses(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_article_geo_addresses_state
  ON article_geo_addresses(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_article_geo_addresses_city
  ON article_geo_addresses(city) WHERE city IS NOT NULL;

-- updated_at trigger
CREATE TRIGGER trg_article_geo_addresses_updated_at
  BEFORE UPDATE ON article_geo_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS — server-side only (same pattern as article_geo_metadata)
ALTER TABLE article_geo_addresses ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.article_geo_addresses FROM anon, authenticated;

-- ── 2. Extend article_geo_metadata with Klasse B fields ───────────────────────

ALTER TABLE article_geo_metadata
  ADD COLUMN IF NOT EXISTS class_b_address_count     smallint,
  ADD COLUMN IF NOT EXISTS class_b_parser_version    text,
  ADD COLUMN IF NOT EXISTS class_b_ai_prompt_version text,
  ADD COLUMN IF NOT EXISTS class_b_ai_processed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS class_b_enrichment_at     timestamptz;
