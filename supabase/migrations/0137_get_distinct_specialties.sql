CREATE OR REPLACE FUNCTION get_distinct_specialties()
RETURNS TABLE(specialty text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT specialty
  FROM article_specialties
  WHERE specialty_match = true
  ORDER BY specialty;
$$;
