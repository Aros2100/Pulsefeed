ALTER TABLE articles ADD COLUMN IF NOT EXISTS specialty_scored_at TIMESTAMPTZ;

-- Backfill: mark already-scored articles using enriched_at as approximation
UPDATE articles
SET specialty_scored_at = enriched_at
WHERE specialty_confidence IS NOT NULL
  AND enriched_at IS NOT NULL
  AND specialty_scored_at IS NULL;
