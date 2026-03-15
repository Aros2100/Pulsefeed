-- 0060: OpenAlex integration — new columns for authors + articles, updated RPC

-- Authors: ror_id, institution_type, geo_source
ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS ror_id TEXT,
  ADD COLUMN IF NOT EXISTS institution_type TEXT,
  ADD COLUMN IF NOT EXISTS geo_source TEXT DEFAULT 'parser';

ALTER TABLE authors
  ADD CONSTRAINT chk_authors_geo_source
  CHECK (geo_source IN ('openalex', 'parser', 'manual', 'ai'));

CREATE INDEX IF NOT EXISTS idx_authors_ror_id ON authors(ror_id) WHERE ror_id IS NOT NULL;

-- Articles: openalex_work_id, fwci
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS openalex_work_id TEXT,
  ADD COLUMN IF NOT EXISTS fwci NUMERIC;

CREATE INDEX IF NOT EXISTS idx_articles_openalex_work_id ON articles(openalex_work_id) WHERE openalex_work_id IS NOT NULL;

-- Update RPC to include doi in return type
CREATE OR REPLACE FUNCTION fetch_unlinked_articles(p_offset int, p_limit int)
RETURNS TABLE(id uuid, pubmed_id text, doi text, authors jsonb)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, pubmed_id, doi, authors
  FROM articles
  WHERE id NOT IN (SELECT article_id FROM article_authors)
    AND authors != '[]'::jsonb
    AND circle IN (1, 2, 3)
  ORDER BY imported_at ASC
  LIMIT p_limit OFFSET p_offset;
$$;
