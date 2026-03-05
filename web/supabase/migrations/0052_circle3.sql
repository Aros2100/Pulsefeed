-- ── articles: tilføj country-kolonne ─────────────────────────────────────
ALTER TABLE articles ADD COLUMN IF NOT EXISTS country TEXT;

-- ── import_logs: tilføj circle-kolonne (til concurrent-guard pr. circle) ─
ALTER TABLE import_logs ADD COLUMN IF NOT EXISTS circle INT;

-- ── circle_3_sources ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS circle_3_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty   TEXT        NOT NULL DEFAULT 'neurosurgery',
  type        TEXT        NOT NULL DEFAULT 'affiliation',
  value       TEXT        NOT NULL,
  description TEXT,
  max_results INT         NOT NULL DEFAULT 500,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed: danske byer med neurokirurgiske afdelinger ────────────────────
-- Værdier er bynavne/hospitalnavne — ingen PubMed-syntax.
-- Query bygges automatisk: ("Copenhagen"[AD] AND neurosurg*[AD])
INSERT INTO circle_3_sources (specialty, type, value, description, max_results) VALUES
  ('neurosurgery', 'affiliation', 'Copenhagen',  'Rigshospitalet',              500),
  ('neurosurgery', 'affiliation', 'Aarhus',      'Aarhus University Hospital',  500),
  ('neurosurgery', 'affiliation', 'Odense',      'Odense University Hospital',  500),
  ('neurosurgery', 'affiliation', 'Aalborg',     'Aalborg University Hospital', 500);
