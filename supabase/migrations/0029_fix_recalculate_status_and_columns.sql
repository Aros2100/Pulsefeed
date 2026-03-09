-- Fix two bugs in recalculate_tagging_rules:
-- 1. Column count mismatch: INSERT listed 8 columns but SELECT only provided 7
--    (missing status expression). This caused the function to fail silently.
-- 2. ON CONFLICT preserved 'disabled' status, preventing re-evaluation.
--    Now only 'active' is preserved — disabled terms can be re-promoted to draft.

-- Also fix any terms currently stuck as 'disabled' that should be 'draft'
UPDATE public.tagging_rules
  SET status = 'draft'
  WHERE status = 'disabled'
    AND approve_rate = 100
    AND total_decisions >= min_decisions;

-- Rewrite function with correct column count and status logic
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
    -- Source 1: Lab decisions (always included)
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

    -- Source 2: C1 approved articles (when p_include_c1 = true)
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
      -- Only preserve active rules (admin explicitly activated)
      WHEN tagging_rules.status = 'active' THEN 'active'
      -- Promote to draft when 100% lab rate AND enough total decisions
      WHEN EXCLUDED.approve_rate = 100
           AND EXCLUDED.total_decisions >= tagging_rules.min_decisions
        THEN 'draft'
      -- Otherwise tracking
      ELSE 'tracking'
    END;
END;
$$;
