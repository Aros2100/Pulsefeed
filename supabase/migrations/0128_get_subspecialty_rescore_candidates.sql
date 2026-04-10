CREATE OR REPLACE FUNCTION get_subspecialty_rescore_candidates(
  p_specialty text,
  p_limit int DEFAULT 50
)
RETURNS TABLE (id uuid)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT a.id
  FROM articles a
  JOIN article_specialties asp ON asp.article_id = a.id
  WHERE asp.specialty = p_specialty
    AND asp.specialty_match = true
    AND a.subspecialty_scored_at IS NOT NULL
    AND a.subspecialty_ai IS NULL
    AND (a.subspecialty IS NULL OR a.subspecialty = '')
    AND NOT EXISTS (
      SELECT 1 FROM lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.module = 'subspecialty'
    )
  LIMIT p_limit;
$$;
