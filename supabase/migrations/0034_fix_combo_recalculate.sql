-- Clean up batch-created tracking rows. Only heatmap clicks should create rules.
DELETE FROM public.tagging_rule_combos;

-- Replace recalculate function: only UPDATE existing rules, never INSERT new ones.
-- New rules are created individually via heatmap clicks (add-tracking endpoint).
CREATE OR REPLACE FUNCTION public.recalculate_tagging_rule_combos(
  p_specialty   text,
  p_include_c1  boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Compute pair stats and update existing rules only
  UPDATE public.tagging_rule_combos rc
  SET
    total_decisions = ps.total_decisions,
    approved        = ps.approved,
    rejected        = ps.rejected,
    approve_rate    = ps.approve_rate,
    source_count    = ps.source_count,
    updated_at      = now(),
    status = CASE
      WHEN rc.status IN ('active', 'disabled') THEN rc.status
      WHEN ps.approve_rate = 100
           AND ps.total_decisions >= rc.min_decisions
        THEN 'draft'
      ELSE 'tracking'
    END
  FROM (
    SELECT
      combined.t1,
      combined.t2,
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
      SUM(combined.is_source)::int AS source_count
    FROM (
      SELECT
        LEAST(m1.descriptor, m2.descriptor)    AS t1,
        GREATEST(m1.descriptor, m2.descriptor) AS t2,
        CASE WHEN ld.decision = 'approved' THEN 1 ELSE 0 END AS is_lab_approved,
        CASE WHEN ld.decision = 'rejected' THEN 1 ELSE 0 END AS is_lab_rejected,
        0 AS is_source
      FROM public.lab_decisions ld
      JOIN public.articles a ON a.id = ld.article_id
      CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem1
      CROSS JOIN LATERAL (
        SELECT elem1->>'descriptor' AS descriptor, (elem1->>'major')::boolean AS major
      ) m1
      CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem2
      CROSS JOIN LATERAL (
        SELECT elem2->>'descriptor' AS descriptor, (elem2->>'major')::boolean AS major
      ) m2
      WHERE ld.specialty = p_specialty
        AND ld.module    = 'specialty_tag'
        AND ld.decision IN ('approved', 'rejected')
        AND m1.major     = true
        AND m2.major     = true
        AND m1.descriptor < m2.descriptor

      UNION ALL

      SELECT
        LEAST(m1.descriptor, m2.descriptor)    AS t1,
        GREATEST(m1.descriptor, m2.descriptor) AS t2,
        0 AS is_lab_approved,
        0 AS is_lab_rejected,
        1 AS is_source
      FROM public.articles a
      CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem1
      CROSS JOIN LATERAL (
        SELECT elem1->>'descriptor' AS descriptor, (elem1->>'major')::boolean AS major
      ) m1
      CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem2
      CROSS JOIN LATERAL (
        SELECT elem2->>'descriptor' AS descriptor, (elem2->>'major')::boolean AS major
      ) m2
      WHERE p_include_c1 = true
        AND a.circle     = 1
        AND a.status     = 'approved'
        AND p_specialty  = ANY(a.specialty_tags)
        AND m1.major     = true
        AND m2.major     = true
        AND m1.descriptor < m2.descriptor
    ) combined
    GROUP BY combined.t1, combined.t2
  ) ps
  WHERE rc.specialty = p_specialty
    AND rc.term_1 = ps.t1
    AND rc.term_2 = ps.t2;

  -- Promote qualifying tracking rules to draft
  UPDATE public.tagging_rule_combos
    SET status = 'draft', updated_at = now()
    WHERE specialty = p_specialty
      AND status = 'tracking'
      AND approve_rate = 100
      AND total_decisions >= min_decisions;
END;
$$;
