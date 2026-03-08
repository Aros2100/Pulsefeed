-- Tagging rules: MeSH-baseret auto-approve regler afledt fra Lab-historik
-- Hver rule tracker et MeSH-term pr. speciale med approve/reject-statistik.

CREATE TABLE public.tagging_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty        TEXT        NOT NULL,
  term             TEXT        NOT NULL,
  total_decisions  INT         NOT NULL DEFAULT 0,
  approved         INT         NOT NULL DEFAULT 0,
  rejected         INT         NOT NULL DEFAULT 0,
  approve_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_decisions    INT         NOT NULL DEFAULT 50,
  status           TEXT        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'disabled')),
  activated_at     TIMESTAMPTZ,
  activated_by     UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (specialty, term)
);

ALTER TABLE public.tagging_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.tagging_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_tagging_rules_specialty_status
  ON public.tagging_rules (specialty, status);

-- Track which articles have been auto-tagged
ALTER TABLE public.articles
  ADD COLUMN auto_tagged_at TIMESTAMPTZ;

-- Recalculate tagging rules from lab_decisions for a given specialty.
-- Aggregates major MeSH terms from approved/rejected articles and upserts into tagging_rules.
CREATE OR REPLACE FUNCTION public.recalculate_tagging_rules(p_specialty text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.tagging_rules (specialty, term, total_decisions, approved, rejected, approve_rate, status)
  SELECT
    p_specialty,
    mesh.descriptor,
    COUNT(*)::int                                          AS total_decisions,
    COUNT(*) FILTER (WHERE ld.decision = 'approved')::int AS approved,
    COUNT(*) FILTER (WHERE ld.decision = 'rejected')::int AS rejected,
    ROUND(
      COUNT(*) FILTER (WHERE ld.decision = 'approved')::numeric
      / NULLIF(COUNT(*), 0) * 100, 2
    )                                                      AS approve_rate
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
  GROUP BY mesh.descriptor
  ON CONFLICT (specialty, term)
  DO UPDATE SET
    total_decisions = EXCLUDED.total_decisions,
    approved        = EXCLUDED.approved,
    rejected        = EXCLUDED.rejected,
    approve_rate    = EXCLUDED.approve_rate,
    updated_at      = now(),
    -- Auto-promote to draft if 100% approve rate and enough decisions (unless disabled)
    status = CASE
      WHEN tagging_rules.status = 'disabled' THEN 'disabled'
      WHEN EXCLUDED.approve_rate = 100
           AND EXCLUDED.total_decisions >= tagging_rules.min_decisions
        THEN 'draft'
      ELSE tagging_rules.status
    END;
END;
$$;
