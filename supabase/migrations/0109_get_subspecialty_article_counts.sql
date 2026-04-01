CREATE OR REPLACE FUNCTION get_subspecialty_article_counts(
  p_specialty      text,
  p_subspecialties text[]
)
RETURNS TABLE (subspecialty text, article_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    sub,
    COUNT(DISTINCT a.id)::bigint AS article_count
  FROM unnest(p_subspecialties) AS sub
  LEFT JOIN articles a
    ON a.status = 'approved'
   AND p_specialty = ANY(a.specialty_tags)
   AND sub = ANY(a.subspecialty_ai)
  GROUP BY sub;
$$;
