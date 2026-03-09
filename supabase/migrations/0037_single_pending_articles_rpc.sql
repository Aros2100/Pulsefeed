-- Pending articles matching at least one active single term (major MeSH).
CREATE OR REPLACE FUNCTION public.get_single_ready_articles(p_specialty text)
RETURNS TABLE(
  article_id uuid,
  title text,
  journal_abbr text,
  published_date text,
  matched_terms jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.journal_abbr,
    a.published_date::text,
    jsonb_agg(DISTINCT e->>'descriptor')
  FROM public.articles a
  CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS e
  JOIN public.tagging_rules tr
    ON tr.specialty = p_specialty
    AND tr.status = 'active'
    AND tr.term = (e->>'descriptor')
  WHERE a.status = 'pending'
    AND p_specialty = ANY(a.specialty_tags)
    AND a.mesh_terms IS NOT NULL
    AND a.mesh_terms != '[]'::jsonb
    AND (e->>'major')::boolean = true
  GROUP BY a.id, a.title, a.journal_abbr, a.published_date;
END;
$$;

-- Pending articles matching at least one draft single term (major MeSH),
-- but NOT matching any active single term.
CREATE OR REPLACE FUNCTION public.get_single_borderline_articles(p_specialty text)
RETURNS TABLE(
  article_id uuid,
  title text,
  journal_abbr text,
  published_date text,
  matched_terms jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.journal_abbr,
    a.published_date::text,
    jsonb_agg(DISTINCT e->>'descriptor')
  FROM public.articles a
  CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS e
  JOIN public.tagging_rules tr
    ON tr.specialty = p_specialty
    AND tr.status = 'draft'
    AND tr.term = (e->>'descriptor')
  WHERE a.status = 'pending'
    AND p_specialty = ANY(a.specialty_tags)
    AND a.mesh_terms IS NOT NULL
    AND a.mesh_terms != '[]'::jsonb
    AND (e->>'major')::boolean = true
    -- Exclude articles that also match active terms
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(a.mesh_terms) AS e2
      JOIN public.tagging_rules tr2
        ON tr2.specialty = p_specialty
        AND tr2.status = 'active'
        AND tr2.term = (e2->>'descriptor')
      WHERE (e2->>'major')::boolean = true
    )
  GROUP BY a.id, a.title, a.journal_abbr, a.published_date;
END;
$$;
