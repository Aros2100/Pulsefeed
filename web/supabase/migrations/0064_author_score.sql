ALTER TABLE authors ADD COLUMN IF NOT EXISTS author_score NUMERIC(5,1);

CREATE OR REPLACE FUNCTION compute_author_scores()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE authors a SET author_score = (
    SELECT AVG(art.evidence_score)
    FROM article_authors aa
    JOIN articles art ON art.id = aa.article_id
    WHERE aa.author_id = a.id
    AND art.evidence_score IS NOT NULL
  )
  WHERE a.article_count >= 3;
$$;
