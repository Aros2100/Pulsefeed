-- Combo tagging rules: pairs of MeSH terms that co-occur in approved articles.
-- Mirrors tagging_rules but with term_1 + term_2 instead of term.

CREATE TABLE public.tagging_rule_combos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty        TEXT        NOT NULL,
  term_1           TEXT        NOT NULL,
  term_2           TEXT        NOT NULL,
  total_decisions  INT         NOT NULL DEFAULT 0,
  approved         INT         NOT NULL DEFAULT 0,
  rejected         INT         NOT NULL DEFAULT 0,
  approve_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,
  source_count     INT         NOT NULL DEFAULT 0,
  min_decisions    INT         NOT NULL DEFAULT 20,
  status           TEXT        NOT NULL DEFAULT 'tracking'
                   CHECK (status IN ('tracking', 'draft', 'active', 'disabled')),
  activated_at     TIMESTAMPTZ,
  activated_by     UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (term_1 < term_2),
  UNIQUE (specialty, term_1, term_2)
);

ALTER TABLE public.tagging_rule_combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.tagging_rule_combos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_tagging_rule_combos_specialty_status
  ON public.tagging_rule_combos (specialty, status);

-- Recalculate combo tagging rules from lab_decisions + C1 source articles.
-- Self-joins mesh_terms to find pairs, same ON CONFLICT + draft-promotion pattern as single terms.
CREATE OR REPLACE FUNCTION public.recalculate_tagging_rule_combos(
  p_specialty   text,
  p_include_c1  boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.tagging_rule_combos
    (specialty, term_1, term_2, total_decisions, approved, rejected, approve_rate, source_count, status)
  SELECT
    p_specialty,
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
    SUM(combined.is_source)::int AS source_count,
    'tracking'::text AS status
  FROM (
    -- Lab decisions: self-join major MeSH terms to get pairs
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

    -- C1 source articles
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
  ON CONFLICT (specialty, term_1, term_2)
  DO UPDATE SET
    total_decisions = EXCLUDED.total_decisions,
    approved        = EXCLUDED.approved,
    rejected        = EXCLUDED.rejected,
    approve_rate    = EXCLUDED.approve_rate,
    source_count    = EXCLUDED.source_count,
    updated_at      = now(),
    status = CASE
      -- Preserve admin-set statuses
      WHEN tagging_rule_combos.status IN ('active', 'disabled') THEN tagging_rule_combos.status
      -- Promote to draft when 100% lab rate AND enough total decisions
      WHEN EXCLUDED.approve_rate = 100
           AND EXCLUDED.total_decisions >= tagging_rule_combos.min_decisions
        THEN 'draft'
      -- Otherwise tracking
      ELSE 'tracking'
    END;

  -- Promote any first-insert combos that already qualify
  UPDATE public.tagging_rule_combos
    SET status = 'draft', updated_at = now()
    WHERE specialty = p_specialty
      AND status = 'tracking'
      AND approve_rate = 100
      AND total_decisions >= min_decisions;
END;
$$;

-- RPC: Get co-occurring MeSH term pairs from approved articles.
-- Returns pairs with their count, excluding pairs where both terms are already active singles.
CREATE OR REPLACE FUNCTION public.get_mesh_co_occurrences(
  p_specialty  text,
  p_min_count  int DEFAULT 3
)
RETURNS TABLE(term_1 text, term_2 text, pair_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH active_singles AS (
    SELECT tr.term
    FROM public.tagging_rules tr
    WHERE tr.specialty = p_specialty
      AND tr.status = 'active'
  ),
  pairs AS (
    SELECT
      LEAST(m1.descriptor, m2.descriptor)    AS t1,
      GREATEST(m1.descriptor, m2.descriptor) AS t2,
      COUNT(DISTINCT a.id) AS cnt
    FROM public.articles a
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem1
    CROSS JOIN LATERAL (
      SELECT elem1->>'descriptor' AS descriptor, (elem1->>'major')::boolean AS major
    ) m1
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem2
    CROSS JOIN LATERAL (
      SELECT elem2->>'descriptor' AS descriptor, (elem2->>'major')::boolean AS major
    ) m2
    WHERE a.status = 'approved'
      AND p_specialty = ANY(a.specialty_tags)
      AND m1.major = true
      AND m2.major = true
      AND m1.descriptor < m2.descriptor
    GROUP BY t1, t2
    HAVING COUNT(DISTINCT a.id) >= p_min_count
  )
  SELECT p.t1, p.t2, p.cnt
  FROM pairs p
  WHERE NOT (
    EXISTS (SELECT 1 FROM active_singles s WHERE s.term = p.t1)
    AND EXISTS (SELECT 1 FROM active_singles s WHERE s.term = p.t2)
  )
  ORDER BY p.cnt DESC;
END;
$$;
