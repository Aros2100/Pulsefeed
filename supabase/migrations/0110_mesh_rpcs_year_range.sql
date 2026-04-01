-- Add p_year_range parameter to mesh RPCs.
-- Must DROP old signatures first (new default param = different overload in Postgres).

DROP FUNCTION IF EXISTS get_mesh_terms_for_subspecialty(text, text, boolean);
DROP FUNCTION IF EXISTS get_mesh_terms_for_subspecialty(text, text);

CREATE OR REPLACE FUNCTION get_mesh_terms_for_subspecialty(
  p_specialty      text,
  p_subspecialty   text,
  p_clinical_only  boolean DEFAULT true,
  p_year_range     text    DEFAULT '2'
)
RETURNS TABLE (term text, lift numeric, article_count bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_total       bigint;
  v_sub         bigint;
  v_year_cutoff int;
BEGIN
  v_year_cutoff := CASE
    WHEN p_year_range = 'all' THEN NULL
    ELSE EXTRACT(YEAR FROM NOW())::int - p_year_range::int
  END;

  SELECT COUNT(DISTINCT id) INTO v_total
  FROM articles
  WHERE status = 'approved'
    AND p_specialty = ANY(specialty_tags)
    AND (v_year_cutoff IS NULL OR published_year >= v_year_cutoff);

  SELECT COUNT(DISTINCT id) INTO v_sub
  FROM articles
  WHERE status = 'approved'
    AND p_specialty = ANY(specialty_tags)
    AND p_subspecialty = ANY(subspecialty_ai)
    AND (v_year_cutoff IS NULL OR published_year >= v_year_cutoff);

  RETURN QUERY
  WITH sub_terms AS (
    SELECT elem->>'descriptor' AS term, COUNT(DISTINCT a.id)::bigint AS sub_count
    FROM articles a
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem
    WHERE a.status = 'approved'
      AND p_specialty = ANY(a.specialty_tags)
      AND p_subspecialty = ANY(a.subspecialty_ai)
      AND elem->>'descriptor' IS NOT NULL
      AND (v_year_cutoff IS NULL OR a.published_year >= v_year_cutoff)
    GROUP BY 1
  ),
  global_terms AS (
    SELECT elem->>'descriptor' AS term, COUNT(DISTINCT a.id)::bigint AS global_count
    FROM articles a
    CROSS JOIN LATERAL jsonb_array_elements(a.mesh_terms) AS elem
    WHERE a.status = 'approved'
      AND p_specialty = ANY(a.specialty_tags)
      AND elem->>'descriptor' IS NOT NULL
      AND (v_year_cutoff IS NULL OR a.published_year >= v_year_cutoff)
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

DROP FUNCTION IF EXISTS count_articles_by_mesh_terms(text, text[]);

CREATE OR REPLACE FUNCTION count_articles_by_mesh_terms(
  p_subspecialty text,
  p_mesh_terms   text[],
  p_year_range   text DEFAULT '2'
)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT a.id)
  FROM articles a
  WHERE a.status = 'approved'
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(a.subspecialty_ai))
    AND (
      SELECT COUNT(DISTINCT t->>'descriptor')
      FROM jsonb_array_elements(a.mesh_terms) t
      WHERE t->>'descriptor' = ANY(p_mesh_terms)
    ) = array_length(p_mesh_terms, 1)
    AND (
      p_year_range = 'all'
      OR a.published_year >= EXTRACT(YEAR FROM NOW())::int - p_year_range::int
    )
$$;
