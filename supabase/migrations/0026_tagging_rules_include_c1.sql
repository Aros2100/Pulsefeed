-- Extend recalculate_tagging_rules to include C1 approved articles
-- as supplementary "approved" decisions alongside lab_decisions.

CREATE OR REPLACE FUNCTION public.recalculate_tagging_rules(
  p_specialty   text,
  p_include_c1  boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.tagging_rules (specialty, term, total_decisions, approved, rejected, approve_rate, status)
  SELECT
    p_specialty,
    combined.descriptor,
    COUNT(*)::int                                                AS total_decisions,
    COUNT(*) FILTER (WHERE combined.decision = 'approved')::int  AS approved,
    COUNT(*) FILTER (WHERE combined.decision = 'rejected')::int  AS rejected,
    ROUND(
      COUNT(*) FILTER (WHERE combined.decision = 'approved')::numeric
      / NULLIF(COUNT(*), 0) * 100, 2
    )                                                            AS approve_rate
  FROM (
    -- Source 1: Lab decisions (always included)
    SELECT
      mesh.descriptor,
      ld.decision
    FROM public.lab_decisions ld
    JOIN public.articles a ON a.id = ld.article_id
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem
    CROSS JOIN LATERAL (
      SELECT
        elem->>'descriptor' AS descriptor,
        (elem->>'major')::boolean AS major
    ) mesh
    WHERE ld.specialty = p_specialty
      AND ld.module    = 'specialty_tag'
      AND ld.decision IN ('approved', 'rejected')
      AND mesh.major   = true

    UNION ALL

    -- Source 2: C1 approved articles (when p_include_c1 = true)
    SELECT
      mesh.descriptor,
      'approved'::text AS decision
    FROM public.articles a
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem
    CROSS JOIN LATERAL (
      SELECT
        elem->>'descriptor' AS descriptor,
        (elem->>'major')::boolean AS major
    ) mesh
    WHERE p_include_c1 = true
      AND a.circle     = 1
      AND a.status     = 'approved'
      AND p_specialty  = ANY(a.specialty_tags)
      AND mesh.major   = true
  ) combined
  GROUP BY combined.descriptor
  ON CONFLICT (specialty, term)
  DO UPDATE SET
    total_decisions = EXCLUDED.total_decisions,
    approved        = EXCLUDED.approved,
    rejected        = EXCLUDED.rejected,
    approve_rate    = EXCLUDED.approve_rate,
    updated_at      = now(),
    status = CASE
      -- Never touch disabled or active rules
      WHEN tagging_rules.status IN ('disabled', 'active') THEN tagging_rules.status
      -- Promote to draft only when 100% rate AND enough decisions
      WHEN EXCLUDED.approve_rate = 100
           AND EXCLUDED.total_decisions >= tagging_rules.min_decisions
        THEN 'draft'
      -- Otherwise stay/revert to tracking
      ELSE 'tracking'
    END;
END;
$$;
