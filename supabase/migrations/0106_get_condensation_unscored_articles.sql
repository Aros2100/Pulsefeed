CREATE OR REPLACE FUNCTION public.get_condensation_unscored_articles(
  p_specialty text,
  p_limit     int DEFAULT 100
)
RETURNS TABLE (
  id       uuid,
  title    text,
  abstract text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    a.id,
    a.title,
    a.abstract
  FROM public.articles a
  WHERE
    p_specialty = ANY(a.specialty_tags)
    AND a.status   = 'approved'
    AND a.circle   = 3
    AND a.abstract IS NOT NULL
    AND a.condensed_at IS NULL
  ORDER BY a.published_date DESC NULLS LAST
  LIMIT p_limit;
$$;
