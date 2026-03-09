-- KPI summary for tagging pages (single + combo).
-- Returns 5 numbers: total_pending, no_mesh, single_ready, combo_ready, no_match.
CREATE OR REPLACE FUNCTION public.get_tagging_kpis(p_specialty text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_total_pending  int;
  v_no_mesh        int;
  v_single_ready   int;
  v_combo_ready    int;
  v_any_match      int;
  v_no_match       int;
BEGIN
  -- 1) Total pending articles with this specialty
  SELECT COUNT(*)::int INTO v_total_pending
  FROM public.articles a
  WHERE a.status = 'pending'
    AND p_specialty = ANY(a.specialty_tags);

  -- 2) Pending without MeSH data (NULL or empty array)
  SELECT COUNT(*)::int INTO v_no_mesh
  FROM public.articles a
  WHERE a.status = 'pending'
    AND p_specialty = ANY(a.specialty_tags)
    AND (a.mesh_terms IS NULL OR a.mesh_terms = '[]'::jsonb);

  -- 3) Single ready: pending with at least one major MeSH matching active single rule
  SELECT COUNT(DISTINCT a.id)::int INTO v_single_ready
  FROM public.articles a
  JOIN public.tagging_rules tr
    ON tr.specialty = p_specialty
    AND tr.status = 'active'
  WHERE a.status = 'pending'
    AND p_specialty = ANY(a.specialty_tags)
    AND a.mesh_terms IS NOT NULL
    AND a.mesh_terms != '[]'::jsonb
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
      WHERE (e->>'descriptor') = tr.term
        AND (e->>'major')::boolean = true
    );

  -- 4) Combo ready: pending with at least one pair of major MeSH matching active combo rule
  SELECT COUNT(DISTINCT a.id)::int INTO v_combo_ready
  FROM public.articles a
  JOIN public.tagging_rule_combos rc
    ON rc.specialty = p_specialty
    AND rc.status = 'active'
  WHERE a.status = 'pending'
    AND p_specialty = ANY(a.specialty_tags)
    AND a.mesh_terms IS NOT NULL
    AND a.mesh_terms != '[]'::jsonb
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
      WHERE (e->>'descriptor') = rc.term_1 AND (e->>'major')::boolean = true
    )
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
      WHERE (e->>'descriptor') = rc.term_2 AND (e->>'major')::boolean = true
    );

  -- 5) Any match (union of single + combo) for no_match calculation
  SELECT COUNT(*)::int INTO v_any_match
  FROM (
    SELECT a.id
    FROM public.articles a
    JOIN public.tagging_rules tr
      ON tr.specialty = p_specialty
      AND tr.status = 'active'
    WHERE a.status = 'pending'
      AND p_specialty = ANY(a.specialty_tags)
      AND a.mesh_terms IS NOT NULL
      AND a.mesh_terms != '[]'::jsonb
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
        WHERE (e->>'descriptor') = tr.term
          AND (e->>'major')::boolean = true
      )

    UNION

    SELECT a.id
    FROM public.articles a
    JOIN public.tagging_rule_combos rc
      ON rc.specialty = p_specialty
      AND rc.status = 'active'
    WHERE a.status = 'pending'
      AND p_specialty = ANY(a.specialty_tags)
      AND a.mesh_terms IS NOT NULL
      AND a.mesh_terms != '[]'::jsonb
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
        WHERE (e->>'descriptor') = rc.term_1 AND (e->>'major')::boolean = true
      )
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(a.mesh_terms) e
        WHERE (e->>'descriptor') = rc.term_2 AND (e->>'major')::boolean = true
      )
  ) matched;

  v_no_match := v_total_pending - v_no_mesh - v_any_match;

  RETURN jsonb_build_object(
    'total_pending', v_total_pending,
    'no_mesh',       v_no_mesh,
    'single_ready',  v_single_ready,
    'combo_ready',   v_combo_ready,
    'no_match',      v_no_match
  );
END;
$$;
