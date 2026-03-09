-- Preserve 'disabled' (rejected) status during recalculation.
-- Admin-rejected terms should stay rejected until manually restored.
CREATE OR REPLACE FUNCTION public.recalculate_tagging_rules(
  p_specialty   text,
  p_include_c1  boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.tagging_rules
    (specialty, term, total_decisions, approved, rejected, approve_rate, source_count, status)
  SELECT
    p_specialty,
    combined.descriptor,
    (SUM(combined.is_lab_approved) + SUM(combined.is_lab_rejected) + SUM(combined.is_source))::int
      AS total_decisions,
    SUM(combined.is_lab_approved)::int  AS approved,
    SUM(combined.is_lab_rejected)::int  AS rejected,
    CASE
      WHEN SUM(combined.is_lab_approved) + SUM(combined.is_lab_rejected) = 0 THEN 0
      ELSE ROUND(
        SUM(combined.is_lab_approved)::numeric
        / (SUM(combined.is_lab_approved) + SUM(combined.is_lab_rejected)) * 100, 2
      )
    END AS approve_rate,
    SUM(combined.is_source)::int AS source_count,
    'tracking'::text AS status
  FROM (
    SELECT
      mesh.descriptor,
      CASE WHEN ld.decision = 'approved' THEN 1 ELSE 0 END AS is_lab_approved,
      CASE WHEN ld.decision = 'rejected' THEN 1 ELSE 0 END AS is_lab_rejected,
      0 AS is_source
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

    SELECT
      mesh.descriptor,
      0 AS is_lab_approved,
      0 AS is_lab_rejected,
      1 AS is_source
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
    source_count    = EXCLUDED.source_count,
    updated_at      = now(),
    status = CASE
      -- Preserve admin-set statuses
      WHEN tagging_rules.status IN ('active', 'disabled') THEN tagging_rules.status
      -- Promote to draft when 100% lab rate AND enough total decisions
      WHEN EXCLUDED.approve_rate = 100
           AND EXCLUDED.total_decisions >= tagging_rules.min_decisions
        THEN 'draft'
      -- Otherwise tracking
      ELSE 'tracking'
    END;
END;
$$;
