CREATE OR REPLACE FUNCTION get_specialty_scoring_candidates(
  p_specialty text,
  p_limit integer DEFAULT 100,
  p_edat_from date DEFAULT NULL,
  p_edat_to date DEFAULT NULL
)
RETURNS TABLE(article_id uuid)
LANGUAGE sql STABLE
AS $$
  SELECT asp.article_id
  FROM article_specialties asp
  JOIN articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND asp.source = 'c2_filter'
    AND asp.specialty_match IS NULL
    AND (
      p_edat_from IS NULL OR p_edat_to IS NULL
      OR (a.pubmed_date >= p_edat_from AND a.pubmed_date <= p_edat_to)
    )
  ORDER BY a.circle DESC NULLS LAST
  LIMIT p_limit;
$$;
