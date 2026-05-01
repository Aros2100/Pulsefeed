-- Migration 0095: get_article_location_coverage RPC
--
-- Returns article-level geo coverage stats using COUNT(DISTINCT article_id)
-- from article_geo_addresses. Replaces per-column COUNT(*) queries that
-- over-counted Class B articles (N address rows per article → counted N times).
-- not_parsed = geo_class='C' (parser ran, no usable geo found).

CREATE OR REPLACE FUNCTION public.get_article_location_coverage()
RETURNS json
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT json_build_object(
    'with_region',  (SELECT COUNT(DISTINCT article_id) FROM public.article_geo_addresses WHERE region  IS NOT NULL),
    'with_country', (SELECT COUNT(DISTINCT article_id) FROM public.article_geo_addresses WHERE country IS NOT NULL),
    'with_state',   (SELECT COUNT(DISTINCT article_id) FROM public.article_geo_addresses WHERE state   IS NOT NULL),
    'with_city',    (SELECT COUNT(DISTINCT article_id) FROM public.article_geo_addresses WHERE city    IS NOT NULL),
    'has_country_no_state', (SELECT COUNT(DISTINCT article_id) FROM public.article_geo_addresses WHERE country IS NOT NULL AND state IS NULL),
    'has_country_no_city',  (SELECT COUNT(DISTINCT article_id) FROM public.article_geo_addresses WHERE country IS NOT NULL AND city  IS NULL),
    'not_parsed',   (SELECT COUNT(*) FROM public.articles WHERE geo_class = 'C')
  )
$function$;
