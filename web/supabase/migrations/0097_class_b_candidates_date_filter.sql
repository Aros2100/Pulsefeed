-- Migration 0097: Add p_edat_from / p_edat_to date filters to
-- get_article_geo_class_b_candidates, mirroring the Class A RPC.

CREATE OR REPLACE FUNCTION public.get_article_geo_class_b_candidates(
  p_specialty  text    DEFAULT 'neurosurgery',
  p_limit      integer DEFAULT 1000,
  p_edat_from  text    DEFAULT NULL::text,
  p_edat_to    text    DEFAULT NULL::text
) RETURNS TABLE (article_id uuid)
LANGUAGE sql STABLE SET search_path = ''
AS $function$
  SELECT DISTINCT a.article_id
  FROM public.article_geo_addresses a
  JOIN public.articles art ON art.id = a.article_id
  WHERE
    art.specialty_tags @> ARRAY[p_specialty]
    AND art.geo_class = 'B'
    AND a.ai_processed_at IS NULL
    AND (p_edat_from IS NULL OR art.pubmed_indexed_at >= p_edat_from::timestamptz)
    AND (p_edat_to   IS NULL OR art.pubmed_indexed_at <= p_edat_to::timestamptz)
    AND (
      a.confidence = 'low'
      OR a.city IS NULL
      OR (a.state IS NULL AND a.country IN (
        'United States','Canada','Australia','India','China','Japan','Brazil',
        'Germany','France','United Kingdom','Mexico','Italy','Spain','Russia',
        'South Korea','Nigeria','Egypt','South Africa','Indonesia','Pakistan'
      ))
      OR a.institution2 ~ '^\d' OR a.institution3 ~ '^\d'
      OR a.institution2 ~ '\d{4,5}' OR a.institution3 ~ '\d{4,5}'
      OR a.institution2 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza|rue|boul)\M'
      OR a.institution3 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza|rue|boul)\M'
      OR (a.city  IS NOT NULL AND (a.institution2 = a.city  OR a.institution3 = a.city))
      OR (a.state IS NOT NULL AND (a.institution2 = a.state OR a.institution3 = a.state))
      OR a.institution ~* '^(Department of|Division of|Service de|Servei de|Klinik|Abteilung)'
      OR cardinality(a.institutions_overflow) > 0
    )
  ORDER BY a.article_id
  LIMIT p_limit;
$function$;
