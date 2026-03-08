-- Add 'tracking' status for terms that haven't reached min_decisions threshold yet.
-- Terms start as 'tracking' and auto-promote to 'draft' only when
-- approve_rate = 100 AND total_decisions >= min_decisions.

ALTER TABLE public.tagging_rules DROP CONSTRAINT tagging_rules_status_check;
ALTER TABLE public.tagging_rules ADD CONSTRAINT tagging_rules_status_check
  CHECK (status IN ('tracking', 'draft', 'active', 'disabled'));

-- Demote existing draft rules that haven't reached threshold back to tracking
UPDATE public.tagging_rules
  SET status = 'tracking'
  WHERE status = 'draft'
    AND (approve_rate < 100 OR total_decisions < min_decisions);

-- Set default to tracking for new rows
ALTER TABLE public.tagging_rules ALTER COLUMN status SET DEFAULT 'tracking';

-- Recreate function with corrected status logic
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
