-- Migration 0088: RPC get_article_geo_class_b_candidates
-- Returns article_ids that have at least one row in article_geo_addresses
-- matching AI-segment criteria AND not yet ai-processed.
--
-- Mirrors the pattern of get_article_geo_class_a_candidates but operates on
-- the per-row article_geo_addresses table and groups by article_id.

CREATE OR REPLACE FUNCTION public.get_article_geo_class_b_candidates(
  p_specialty text DEFAULT 'neurosurgery',
  p_limit     integer DEFAULT 1000
) RETURNS TABLE (article_id uuid)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT DISTINCT a.article_id
  FROM public.article_geo_addresses a
  JOIN public.articles art ON art.id = a.article_id
  LEFT JOIN public.article_geo_metadata m ON m.article_id = a.article_id
  WHERE
    art.specialty_tags @> ARRAY[p_specialty]
    AND m.geo_class = 'B'
    AND a.ai_processed_at IS NULL
    AND (
      a.confidence = 'low'
      OR a.city IS NULL
      OR (a.state IS NULL AND a.country IN (
        'United States','Canada','Australia','India','China','Japan','Brazil',
        'Germany','France','United Kingdom','Mexico','Italy','Spain','Russia',
        'South Korea','Nigeria','Egypt','South Africa','Indonesia','Pakistan'
      ))
      OR a.institution2 ~ '^\d'
      OR a.institution3 ~ '^\d'
      OR a.institution2 ~ '\d{4,5}'
      OR a.institution3 ~ '\d{4,5}'
      OR a.institution2 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza|rue|boul)\M'
      OR a.institution3 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza|rue|boul)\M'
      OR (a.city  IS NOT NULL AND (a.institution2 = a.city  OR a.institution3 = a.city))
      OR (a.state IS NOT NULL AND (a.institution2 = a.state OR a.institution3 = a.state))
      OR a.institution ~* '^(Department of|Division of|Service de|Servei de|Klinik|Abteilung)'
      OR cardinality(a.institutions_overflow) > 0
    )
  ORDER BY a.article_id
  LIMIT p_limit
$function$;
