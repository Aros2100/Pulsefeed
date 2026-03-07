ALTER TABLE articles ADD COLUMN IF NOT EXISTS evidence_score NUMERIC(5,1)
  GENERATED ALWAYS AS (
    ROUND((
      LEAST(COALESCE(citation_count, 0)::float / 50, 1.0) * 40
      + LEAST(COALESCE(impact_factor, 0) / 5, 1.0) * 40
      + LEAST(COALESCE(journal_h_index, 0) / 360, 1.0) * 20
    )::numeric, 1)
  ) STORED;
