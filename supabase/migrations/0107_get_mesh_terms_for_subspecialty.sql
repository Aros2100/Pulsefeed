CREATE OR REPLACE FUNCTION get_mesh_terms_for_subspecialty(
  p_specialty      text,
  p_subspecialty   text,
  p_clinical_only  boolean DEFAULT true
)
RETURNS TABLE (term text, lift numeric, article_count bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_total  bigint;
  v_sub    bigint;
BEGIN
  SELECT COUNT(DISTINCT id) INTO v_total
  FROM articles
  WHERE status = 'approved' AND p_specialty = ANY(specialty_tags);

  SELECT COUNT(DISTINCT id) INTO v_sub
  FROM articles
  WHERE status = 'approved'
    AND p_specialty = ANY(specialty_tags)
    AND p_subspecialty = ANY(subspecialty_ai);

  RETURN QUERY
  WITH sub_terms AS (
    SELECT elem->>'descriptor' AS term, COUNT(DISTINCT a.id)::bigint AS sub_count
    FROM articles a
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem
    WHERE a.status = 'approved'
      AND p_specialty = ANY(a.specialty_tags)
      AND p_subspecialty = ANY(a.subspecialty_ai)
      AND elem->>'descriptor' IS NOT NULL
    GROUP BY 1
  ),
  global_terms AS (
    SELECT elem->>'descriptor' AS term, COUNT(DISTINCT a.id)::bigint AS global_count
    FROM articles a
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem
    WHERE a.status = 'approved'
      AND p_specialty = ANY(a.specialty_tags)
      AND elem->>'descriptor' IS NOT NULL
    GROUP BY 1
  )
  SELECT
    s.term,
    ROUND(
      (s.sub_count::numeric / NULLIF(v_sub, 0)) /
      NULLIF(g.global_count::numeric / NULLIF(v_total, 0), 0),
      2
    ) AS lift,
    s.sub_count AS article_count
  FROM sub_terms s
  JOIN global_terms g USING (term)
  WHERE s.sub_count >= 3
    AND (NOT p_clinical_only OR s.term NOT IN (
      'Humans','Male','Female','Middle Aged','Adult','Aged','Aged, 80 and over',
      'Young Adult','Adolescent','Child','Child, Preschool','Infant','Infant, Newborn',
      'Animals','Retrospective Studies','Prospective Studies','Follow-Up Studies',
      'Cohort Studies','Treatment Outcome','Risk Factors','Prognosis'
    ))
  ORDER BY article_count DESC
  LIMIT 16;
END;
$$;
