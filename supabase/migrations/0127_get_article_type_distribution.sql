CREATE OR REPLACE FUNCTION public.get_article_type_distribution(p_specialty text)
RETURNS TABLE(article_type text, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT a.article_type, COUNT(*) as n
  FROM public.articles a
  JOIN public.article_specialties s ON s.article_id = a.id
  WHERE s.specialty = p_specialty
    AND s.specialty_match = true
    AND a.article_type IS NOT NULL
  GROUP BY a.article_type
  ORDER BY n DESC;
$$;
