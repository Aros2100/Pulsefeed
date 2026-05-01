-- Migration 0089: count_article_geo_class_b_unscored
-- Simple count wrapper over get_article_geo_class_b_candidates.
-- Used by the admin batch UI to show pending candidate count.

CREATE OR REPLACE FUNCTION public.count_article_geo_class_b_unscored(
  p_specialty text DEFAULT 'neurosurgery'
) RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT COUNT(*)::integer
  FROM public.get_article_geo_class_b_candidates(p_specialty, 100000)
$function$;
