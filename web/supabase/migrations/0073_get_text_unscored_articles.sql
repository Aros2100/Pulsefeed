CREATE OR REPLACE FUNCTION public.get_text_unscored_articles(
  p_specialty text,
  p_limit int DEFAULT 10
)
RETURNS TABLE (id uuid, title text, abstract text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT a.id, a.title, a.abstract
  FROM public.articles a
  WHERE EXISTS (
    SELECT 1 FROM public.article_specialties asp
    WHERE asp.article_id = a.id
    AND asp.specialty = p_specialty
    AND asp.specialty_match = true
  )
  AND a.abstract IS NOT NULL
  AND a.short_headline IS NULL
  ORDER BY a.pubmed_indexed_at DESC NULLS LAST
  LIMIT p_limit;
$$;
