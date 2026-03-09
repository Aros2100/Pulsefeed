-- Article counts per combo rule pair (co-occurrences + pending).
CREATE OR REPLACE FUNCTION public.get_combo_article_counts(p_specialty text)
RETURNS TABLE(term_1 text, term_2 text, co_occurrences bigint, pending_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.term_1,
    rc.term_2,
    COALESCE(counts.co_occ, 0)::bigint  AS co_occurrences,
    COALESCE(counts.pend, 0)::bigint    AS pending_count
  FROM public.tagging_rule_combos rc
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT CASE WHEN a.status = 'approved' THEN a.id END) AS co_occ,
      COUNT(DISTINCT CASE WHEN a.status = 'pending'  THEN a.id END) AS pend
    FROM public.articles a
    WHERE p_specialty = ANY(a.specialty_tags)
      AND a.status IN ('approved', 'pending')
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
        WHERE (e->>'descriptor') = rc.term_1 AND (e->>'major')::boolean = true
      )
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
        WHERE (e->>'descriptor') = rc.term_2 AND (e->>'major')::boolean = true
      )
  ) counts ON true
  WHERE rc.specialty = p_specialty;
END;
$$;

-- Pending articles matching active combo pairs.
CREATE OR REPLACE FUNCTION public.get_combo_pending_articles(p_specialty text)
RETURNS TABLE(
  article_id uuid,
  title text,
  journal_abbr text,
  published_date text,
  matched_combos jsonb
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
    jsonb_agg(jsonb_build_object('term_1', rc.term_1, 'term_2', rc.term_2))
  FROM public.articles a
  JOIN public.tagging_rule_combos rc
    ON rc.specialty = p_specialty
    AND rc.status = 'active'
  WHERE a.status = 'pending'
    AND p_specialty = ANY(a.specialty_tags)
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
      WHERE (e->>'descriptor') = rc.term_1 AND (e->>'major')::boolean = true
    )
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
      WHERE (e->>'descriptor') = rc.term_2 AND (e->>'major')::boolean = true
    )
  GROUP BY a.id, a.title, a.journal_abbr, a.published_date;
END;
$$;
