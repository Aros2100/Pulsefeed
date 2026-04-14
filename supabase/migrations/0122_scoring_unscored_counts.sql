CREATE OR REPLACE FUNCTION count_subspecialty_unscored(p_specialty text)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)
  FROM articles a
  JOIN article_specialties asp ON asp.article_id = a.id
  WHERE asp.specialty = p_specialty
    AND asp.specialty_match = true
    AND a.subspecialty_scored_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION count_article_type_unscored()
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)
  FROM articles a
  JOIN article_specialties asp ON asp.article_id = a.id
  WHERE asp.specialty_match = true
    AND a.article_type IS NULL
    AND (a.article_type_validated IS NULL OR a.article_type_validated = false);
$$;
