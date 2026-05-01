-- Migration 0091: get_geo_options_filtered reads from article_geo_addresses
--
-- The RPC previously read from articles.geo_* flat columns.
-- New articles write only to article_geo_addresses, so the dropdown
-- options must now come from that table.
-- Field names in article_geo_addresses: continent, region, country, state, city, institution.
-- Callers still use the geo_* naming convention in p_field (mapped here).

CREATE OR REPLACE FUNCTION public.get_geo_options_filtered(
  p_field     text,
  p_continent text DEFAULT NULL::text,
  p_region    text DEFAULT NULL::text,
  p_country   text DEFAULT NULL::text,
  p_state     text DEFAULT NULL::text
)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ARRAY(
    SELECT DISTINCT val
    FROM (
      SELECT
        CASE p_field
          WHEN 'geo_continent'   THEN continent
          WHEN 'geo_region'      THEN region
          WHEN 'geo_country'     THEN country
          WHEN 'geo_state'       THEN state
          WHEN 'geo_city'        THEN city
          WHEN 'geo_institution' THEN institution
        END AS val
      FROM article_geo_addresses
      WHERE
        (p_continent IS NULL OR continent = p_continent)
        AND (p_region   IS NULL OR region   = p_region)
        AND (p_country  IS NULL OR country  = p_country)
        AND (p_state    IS NULL OR state    = p_state)
    ) sub
    WHERE val IS NOT NULL AND val != ''
    ORDER BY val
  );
$function$;
