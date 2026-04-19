-- Rename pico_* → sari_* in get_newsletter_articles RPC
DROP FUNCTION IF EXISTS public.get_newsletter_articles(text, timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.get_newsletter_articles(
  p_specialty text,
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
RETURNS TABLE(
  id uuid, title text, journal_abbr text, pubmed_indexed_at timestamp with time zone,
  authors jsonb, article_type text, news_value numeric, clinical_relevance text,
  short_resume text, abstract text, pubmed_id text, volume text, issue text,
  subspecialty text[], short_headline text, bottom_line text,
  sari_subject text, sari_action text, sari_result text, sari_implication text,
  sample_size integer
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (a.id)
    a.id, a.title, a.journal_abbr, a.pubmed_indexed_at,
    a.authors, a.article_type, a.news_value,
    a.clinical_relevance, a.short_resume, a.abstract,
    a.pubmed_id, a.volume, a.issue, a.subspecialty,
    a.short_headline, a.bottom_line,
    a.sari_subject, a.sari_action, a.sari_result, a.sari_implication,
    a.sample_size
  FROM articles a
  JOIN article_specialties asp ON asp.article_id = a.id
  WHERE asp.specialty = p_specialty
    AND asp.specialty_match = true
    AND a.pubmed_indexed_at >= p_start::date
    AND a.pubmed_indexed_at <= p_end::date
  ORDER BY a.id, a.news_value DESC NULLS LAST;
$$;
