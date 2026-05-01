-- Migration 0090: Update Klasse A RPCs to read from article_geo_addresses
--
-- New articles write to article_geo_addresses (not flat articles.geo_*).
-- The candidate and count RPCs now join on article_geo_addresses (position=1)
-- for segment criteria instead of articles.geo_* columns.
-- Old articles without address rows are excluded naturally by the INNER JOIN.
-- Return type changes require DROP before CREATE OR REPLACE.

-- ── 1. get_article_geo_class_a_candidates ────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_article_geo_class_a_candidates(integer, text, text);

CREATE OR REPLACE FUNCTION public.get_article_geo_class_a_candidates(
  p_limit     integer DEFAULT 10000,
  p_edat_from text    DEFAULT NULL::text,
  p_edat_to   text    DEFAULT NULL::text
)
RETURNS TABLE(
  id                    uuid,
  pubmed_id             text,
  affiliation_raw       text,
  geo_class             text,
  addr_row_id           uuid,
  city                  text,
  state                 text,
  country               text,
  region                text,
  continent             text,
  institution           text,
  institution2          text,
  institution3          text,
  institutions_overflow text[],
  department            text,
  department2           text,
  department3           text,
  departments_overflow  text[],
  confidence            text,
  geo_confidence        text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT
    a.id,
    a.pubmed_id,
    COALESCE(
      (a.authors->0->'affiliations'->>0),
      (a.authors->0->>'affiliation')
    )::text                               AS affiliation_raw,
    a.geo_class::text,
    addr.id                               AS addr_row_id,
    addr.city,
    addr.state,
    addr.country,
    addr.region,
    addr.continent,
    addr.institution,
    addr.institution2,
    addr.institution3,
    COALESCE(addr.institutions_overflow, '{}'),
    addr.department,
    addr.department2,
    addr.department3,
    COALESCE(addr.departments_overflow, '{}'),
    addr.confidence,
    m.geo_confidence
  FROM public.articles a
  JOIN public.article_geo_addresses addr
    ON addr.article_id = a.id AND addr.position = 1
  LEFT JOIN public.article_geo_metadata m ON m.article_id = a.id
  WHERE
    a.geo_class = 'A'
    AND m.parser_processed_at IS NOT NULL
    AND m.ai_processed_at IS NULL
    AND addr.ai_processed_at IS NULL
    AND (
      addr.confidence = 'low'
      OR addr.city IS NULL
      OR (addr.state IS NULL AND addr.country IN (
        'United States','Canada','Australia','India','China','Japan','Brazil',
        'Germany','France','United Kingdom','Mexico','Italy','Spain','Russia',
        'South Korea','Nigeria','Egypt','South Africa','Indonesia','Pakistan'
      ))
      OR addr.institution2 ~ '^\d'
      OR addr.institution3 ~ '^\d'
      OR addr.institution2 ~ '\d{4,5}'
      OR addr.institution3 ~ '\d{4,5}'
      OR addr.institution2 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza)\M'
      OR addr.institution3 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza)\M'
      OR (addr.city  IS NOT NULL AND (addr.institution2 = addr.city  OR addr.institution3 = addr.city))
      OR (addr.state IS NOT NULL AND (addr.institution2 = addr.state OR addr.institution3 = addr.state))
      OR addr.institution ~* '^\y(Department of|Division of|Service de|Servei de|Klinik|Abteilung)\y'
      OR cardinality(addr.institutions_overflow) > 0
    )
    AND (p_edat_from IS NULL OR a.pubmed_indexed_at >= p_edat_from::timestamptz)
    AND (p_edat_to   IS NULL OR a.pubmed_indexed_at <= p_edat_to::timestamptz)
  ORDER BY a.id
  LIMIT p_limit
$function$;

-- ── 2. count_article_geo_class_a_unscored ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_article_geo_class_a_unscored()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT COUNT(*)::integer
  FROM public.articles a
  JOIN public.article_geo_addresses addr
    ON addr.article_id = a.id AND addr.position = 1
  LEFT JOIN public.article_geo_metadata m ON m.article_id = a.id
  WHERE
    a.geo_class = 'A'
    AND m.parser_processed_at IS NOT NULL
    AND m.ai_processed_at IS NULL
    AND addr.ai_processed_at IS NULL
    AND (
      addr.confidence = 'low'
      OR addr.city IS NULL
      OR (addr.state IS NULL AND addr.country IN (
        'United States','Canada','Australia','India','China','Japan','Brazil',
        'Germany','France','United Kingdom','Mexico','Italy','Spain','Russia',
        'South Korea','Nigeria','Egypt','South Africa','Indonesia','Pakistan'
      ))
      OR addr.institution2 ~ '^\d'
      OR addr.institution3 ~ '^\d'
      OR addr.institution2 ~ '\d{4,5}'
      OR addr.institution3 ~ '\d{4,5}'
      OR addr.institution2 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza)\M'
      OR addr.institution3 ~* '\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza)\M'
      OR (addr.city  IS NOT NULL AND (addr.institution2 = addr.city  OR addr.institution3 = addr.city))
      OR (addr.state IS NOT NULL AND (addr.institution2 = addr.state OR addr.institution3 = addr.state))
      OR addr.institution ~* '^\y(Department of|Division of|Service de|Servei de|Klinik|Abteilung)\y'
      OR cardinality(addr.institutions_overflow) > 0
    )
$function$;
