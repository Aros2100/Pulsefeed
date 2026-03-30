CREATE OR REPLACE FUNCTION public.count_condensation_not_validated(
  p_specialty text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)
  FROM public.articles a
  WHERE a.specialty_tags @> ARRAY[p_specialty]
    AND a.condensed_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lab_decisions ld
      WHERE ld.article_id = a.id
        AND ld.specialty  = p_specialty
        AND ld.module     = 'condensation_text'
    );
$$;
