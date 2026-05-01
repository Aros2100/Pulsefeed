-- Migration 0094: Update all geo RPCs to read from article_geo_addresses
--
-- Column name mapping:
--   articles.geo_continent  → article_geo_addresses.continent
--   articles.geo_region     → article_geo_addresses.region
--   articles.geo_country    → article_geo_addresses.country
--   articles.geo_state      → article_geo_addresses.state
--   articles.geo_city       → article_geo_addresses.city
--   articles.geo_institution → article_geo_addresses.institution
--
-- For count aggregations: COUNT(DISTINCT article_id) preserves "articles" semantics
-- (Klasse B articles with N address rows each count once per geo value).
--
-- For filtering RPCs: a single EXISTS subquery matches articles that have at least
-- one address row satisfying all specified geo conditions simultaneously — correct
-- for both single-address (Klasse A) and multi-address (Klasse B) articles.
--
-- Legacy articles (no rows in article_geo_addresses) are excluded when geo
-- filters are applied — accepted consequence, they will be re-parsed later.

-- ── 1. get_geo_continents ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_continents(p_since date DEFAULT NULL::date)
RETURNS TABLE(continent text, count bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT addr.continent, COUNT(DISTINCT addr.article_id)
  FROM public.article_geo_addresses addr
  JOIN public.articles a ON a.id = addr.article_id
  WHERE addr.continent IS NOT NULL
    AND (p_since IS NULL OR a.indexed_date > p_since)
  GROUP BY addr.continent ORDER BY count DESC;
$function$;

-- ── 2. get_geo_regions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_regions(p_since date DEFAULT NULL::date, p_continent text DEFAULT NULL::text)
RETURNS TABLE(region text, count bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT addr.region, COUNT(DISTINCT addr.article_id)
  FROM public.article_geo_addresses addr
  JOIN public.articles a ON a.id = addr.article_id
  WHERE addr.region IS NOT NULL
    AND (p_since IS NULL OR a.indexed_date > p_since)
    AND (p_continent IS NULL OR addr.continent = p_continent)
  GROUP BY addr.region ORDER BY count DESC;
$function$;

-- ── 3. get_geo_countries ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_countries(p_since date DEFAULT NULL::date, p_region text DEFAULT NULL::text)
RETURNS TABLE(country text, count bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT addr.country, COUNT(DISTINCT addr.article_id)
  FROM public.article_geo_addresses addr
  JOIN public.articles a ON a.id = addr.article_id
  WHERE addr.country IS NOT NULL
    AND (p_since IS NULL OR a.indexed_date > p_since)
    AND (p_region IS NULL OR addr.region = p_region)
  GROUP BY addr.country ORDER BY count DESC;
$function$;

-- ── 4. get_geo_states ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_states(p_since date DEFAULT NULL::date, p_country text DEFAULT NULL::text)
RETURNS TABLE(state text, count bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT addr.state, COUNT(DISTINCT addr.article_id)
  FROM public.article_geo_addresses addr
  JOIN public.articles a ON a.id = addr.article_id
  WHERE addr.state IS NOT NULL
    AND (p_since IS NULL OR a.indexed_date > p_since)
    AND (p_country IS NULL OR addr.country = p_country)
  GROUP BY addr.state ORDER BY count DESC;
$function$;

-- ── 5. get_geo_cities (2 overloads) ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_cities(p_since date DEFAULT NULL::date, p_country text DEFAULT NULL::text)
RETURNS TABLE(city text, count bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT addr.city, COUNT(DISTINCT addr.article_id)
  FROM public.article_geo_addresses addr
  JOIN public.articles a ON a.id = addr.article_id
  WHERE addr.city IS NOT NULL
    AND (p_since IS NULL OR a.indexed_date > p_since)
    AND (p_country IS NULL OR addr.country = p_country)
  GROUP BY addr.city ORDER BY count DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_geo_cities(p_since date DEFAULT NULL::date, p_country text DEFAULT NULL::text, p_state text DEFAULT NULL::text)
RETURNS TABLE(city text, count bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT addr.city, COUNT(DISTINCT addr.article_id)
  FROM public.article_geo_addresses addr
  JOIN public.articles a ON a.id = addr.article_id
  WHERE addr.city IS NOT NULL
    AND (p_since IS NULL OR a.indexed_date > p_since)
    AND (p_country IS NULL OR addr.country = p_country)
    AND (p_state   IS NULL OR addr.state   = p_state)
  GROUP BY addr.city ORDER BY count DESC;
$function$;

-- ── 6. get_geo_regions_week ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_regions_week(p_since timestamp with time zone)
RETURNS TABLE(region text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT addr.region, COUNT(DISTINCT addr.article_id) AS count
  FROM article_geo_addresses addr
  WHERE addr.region IS NOT NULL
  GROUP BY addr.region ORDER BY count DESC;
$function$;

-- ── 7. get_geo_countries_week ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_countries_week(p_since timestamp with time zone)
RETURNS TABLE(region text, country text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT addr.region, addr.country, COUNT(DISTINCT addr.article_id) AS count
  FROM article_geo_addresses addr
  WHERE addr.region  IS NOT NULL
    AND addr.country IS NOT NULL
  GROUP BY addr.region, addr.country ORDER BY count DESC;
$function$;

-- ── 8. get_geo_cities_week ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_cities_week(p_since timestamp with time zone, p_country text)
RETURNS TABLE(city text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT addr.city, COUNT(DISTINCT addr.article_id) AS count
  FROM article_geo_addresses addr
  WHERE addr.country = p_country
    AND addr.city IS NOT NULL
  GROUP BY addr.city ORDER BY count DESC;
$function$;

-- ── 9. get_article_geo_options ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_article_geo_options()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'continents', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (SELECT DISTINCT continent AS v FROM article_geo_addresses WHERE continent IS NOT NULL) s
    ),
    'countries', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (SELECT DISTINCT country AS v FROM article_geo_addresses WHERE country IS NOT NULL) s
    ),
    'cities', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (SELECT DISTINCT city AS v FROM article_geo_addresses WHERE city IS NOT NULL) s
    )
  );
$function$;

-- ── 10. count_distinct_geo_regions ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_distinct_geo_regions()
RETURNS integer
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COUNT(DISTINCT region)::integer FROM public.article_geo_addresses WHERE region IS NOT NULL;
$function$;

-- ── 11. count_city_alias_resolved ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_city_alias_resolved()
RETURNS integer
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COUNT(DISTINCT article_id)::integer
  FROM public.article_geo_addresses
  WHERE city IS NOT NULL AND lower(city) IN (SELECT lower(canonical) FROM public.city_aliases);
$function$;

-- ── 12. count_article_suspect_city_values ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_article_suspect_city_values()
RETURNS integer
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COUNT(*)::integer FROM public.article_geo_addresses
  WHERE city IS NOT NULL AND (
    city ~ '^\d' OR city ~ '\d{4}' OR city ~ '^[A-Z]{2,4}$'
    OR city ~ '\d+-\d+' OR city ~* '\b(Ave|Street|Blvd|Road|Floor|Hall)\b'
    OR city ~* '\b(Society|Institute|University|Cancer|Hospital|MR-Centre)\b'
    OR city ~* 'cedex' OR city ~* '^and\s'
  );
$function$;

-- ── 13. get_suspect_city_article_ids ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_suspect_city_article_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT DISTINCT article_id AS id FROM public.article_geo_addresses
  WHERE city IS NOT NULL AND (
    city ~ '^\d' OR city ~ '\d{4}' OR city ~ '^[A-Z]{2,4}$'
    OR city ~ '\d+-\d+' OR city ~* '\b(Ave|Street|Blvd|Road|Floor|Hall)\b'
    OR city ~* '\b(Society|Institute|University|Cancer|Hospital|MR-Centre)\b'
    OR city ~* 'cedex' OR city ~* '^and\s'
  );
$function$;

-- ── 14. get_kpi_overview ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_kpi_overview(p_period text, p_subspecialty text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v_since date; v_total bigint; v_regions jsonb; v_period_label text;
BEGIN
  v_since := CASE p_period
    WHEN 'week'  THEN CURRENT_DATE-7
    WHEN 'month' THEN CURRENT_DATE-30
    WHEN 'year'  THEN CURRENT_DATE-365
    ELSE CURRENT_DATE-7
  END;
  v_period_label := CASE p_period
    WHEN 'week'  THEN 'Uge '||EXTRACT(WEEK FROM CURRENT_DATE)::text||', '||EXTRACT(YEAR FROM CURRENT_DATE)::text
    WHEN 'month' THEN to_char(CURRENT_DATE,'TMMonth YYYY')
    WHEN 'year'  THEN EXTRACT(YEAR FROM CURRENT_DATE)::text
  END;

  SELECT count(*) INTO v_total
  FROM public.articles a
  JOIN public.article_specialties asp ON asp.article_id = a.id AND asp.specialty_match = true
  WHERE a.pubmed_indexed_at >= v_since
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(a.subspecialty));

  SELECT coalesce(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.count DESC), '[]'::jsonb)
  INTO v_regions
  FROM (
    SELECT addr.region AS name, COUNT(DISTINCT addr.article_id) AS count
    FROM public.article_geo_addresses addr
    JOIN public.articles a ON a.id = addr.article_id
    JOIN public.article_specialties asp ON asp.article_id = a.id AND asp.specialty_match = true
    WHERE a.pubmed_indexed_at >= v_since
      AND addr.region IS NOT NULL
      AND (p_subspecialty IS NULL OR p_subspecialty = ANY(a.subspecialty))
    GROUP BY addr.region ORDER BY count DESC
  ) sub;

  RETURN jsonb_build_object('totalArticles', v_total, 'regions', v_regions, 'periodLabel', v_period_label);
END;
$function$;

-- ── 15. count_articles_by_specialty (3 overloads) ────────────────────────────
-- Geo filters: single EXISTS subquery with all conditions (correct for multi-address).

CREATE OR REPLACE FUNCTION public.count_articles_by_specialty(
  p_specialty text, p_specialty_match text,
  p_subspecialty text DEFAULT NULL::text,
  p_geo_continent text DEFAULT NULL::text, p_geo_region text DEFAULT NULL::text,
  p_geo_country text DEFAULT NULL::text, p_geo_state text DEFAULT NULL::text,
  p_geo_city text DEFAULT NULL::text,
  p_circle integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text
)
RETURNS bigint LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COUNT(*) FROM public.article_specialties asp JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE WHEN p_specialty_match='true'  THEN asp.specialty_match=true
             WHEN p_specialty_match='false' THEN asp.specialty_match=false
             WHEN p_specialty_match='null'  THEN asp.specialty_match IS NULL ELSE true END
    AND (p_subspecialty IS NULL OR a.subspecialty_ai @> ARRAY[p_subspecialty])
    AND (p_circle IS NULL OR a.circle = p_circle)
    AND (p_search IS NULL OR a.title ILIKE '%'||p_search||'%' OR a.journal_abbr ILIKE '%'||p_search||'%')
    AND (
      p_geo_continent IS NULL AND p_geo_region IS NULL AND p_geo_country IS NULL
      AND p_geo_state IS NULL AND p_geo_city IS NULL
      OR EXISTS (
        SELECT 1 FROM public.article_geo_addresses addr WHERE addr.article_id = a.id
          AND (p_geo_continent IS NULL OR addr.continent = p_geo_continent)
          AND (p_geo_region    IS NULL OR addr.region    = p_geo_region)
          AND (p_geo_country   IS NULL OR addr.country   = p_geo_country)
          AND (p_geo_state     IS NULL OR addr.state     = p_geo_state)
          AND (p_geo_city      IS NULL OR addr.city      = p_geo_city)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.count_articles_by_specialty(
  p_specialty text, p_specialty_match text,
  p_subspecialty text DEFAULT NULL::text,
  p_geo_continent text DEFAULT NULL::text, p_geo_region text DEFAULT NULL::text,
  p_geo_country text DEFAULT NULL::text, p_geo_state text DEFAULT NULL::text,
  p_geo_city text DEFAULT NULL::text,
  p_circle integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text,
  p_article_type text DEFAULT NULL::text
)
RETURNS bigint LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COUNT(*) FROM public.article_specialties asp JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE WHEN p_specialty_match='true'  THEN asp.specialty_match=true
             WHEN p_specialty_match='false' THEN asp.specialty_match=false
             WHEN p_specialty_match='null'  THEN asp.specialty_match IS NULL ELSE true END
    AND (p_subspecialty IS NULL OR a.subspecialty_ai @> ARRAY[p_subspecialty])
    AND (p_circle IS NULL OR a.circle = p_circle)
    AND (p_search IS NULL OR a.title ILIKE '%'||p_search||'%' OR a.journal_abbr ILIKE '%'||p_search||'%')
    AND (p_article_type IS NULL OR (p_article_type='Unclassified' AND a.article_type IS NULL) OR (p_article_type<>'Unclassified' AND a.article_type=p_article_type))
    AND (
      p_geo_continent IS NULL AND p_geo_region IS NULL AND p_geo_country IS NULL
      AND p_geo_state IS NULL AND p_geo_city IS NULL
      OR EXISTS (
        SELECT 1 FROM public.article_geo_addresses addr WHERE addr.article_id = a.id
          AND (p_geo_continent IS NULL OR addr.continent = p_geo_continent)
          AND (p_geo_region    IS NULL OR addr.region    = p_geo_region)
          AND (p_geo_country   IS NULL OR addr.country   = p_geo_country)
          AND (p_geo_state     IS NULL OR addr.state     = p_geo_state)
          AND (p_geo_city      IS NULL OR addr.city      = p_geo_city)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.count_articles_by_specialty(
  p_specialty text, p_specialty_match text,
  p_subspecialties text[] DEFAULT NULL::text[],
  p_geo_continent text DEFAULT NULL::text, p_geo_region text DEFAULT NULL::text,
  p_geo_country text DEFAULT NULL::text, p_geo_state text DEFAULT NULL::text,
  p_geo_city text DEFAULT NULL::text,
  p_circle integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text,
  p_article_types text[] DEFAULT NULL::text[],
  p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date
)
RETURNS bigint LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COUNT(*) FROM public.article_specialties asp JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE WHEN p_specialty_match='true'  THEN asp.specialty_match=true
             WHEN p_specialty_match='false' THEN asp.specialty_match=false
             WHEN p_specialty_match='null'  THEN asp.specialty_match IS NULL ELSE true END
    AND (p_subspecialties IS NULL OR a.subspecialty_ai && p_subspecialties)
    AND (p_circle IS NULL OR a.circle = p_circle)
    AND (p_search IS NULL OR a.title ILIKE '%'||p_search||'%' OR a.journal_abbr ILIKE '%'||p_search||'%')
    AND (p_date_from IS NULL OR a.published_date >= p_date_from)
    AND (p_date_to   IS NULL OR a.published_date <= p_date_to)
    AND (p_article_types IS NULL OR (ARRAY['Unclassified'] && p_article_types AND a.article_type IS NULL) OR a.article_type = ANY(p_article_types))
    AND (
      p_geo_continent IS NULL AND p_geo_region IS NULL AND p_geo_country IS NULL
      AND p_geo_state IS NULL AND p_geo_city IS NULL
      OR EXISTS (
        SELECT 1 FROM public.article_geo_addresses addr WHERE addr.article_id = a.id
          AND (p_geo_continent IS NULL OR addr.continent = p_geo_continent)
          AND (p_geo_region    IS NULL OR addr.region    = p_geo_region)
          AND (p_geo_country   IS NULL OR addr.country   = p_geo_country)
          AND (p_geo_state     IS NULL OR addr.state     = p_geo_state)
          AND (p_geo_city      IS NULL OR addr.city      = p_geo_city)
      )
    );
$function$;

-- ── 16. get_article_ids_by_specialty_paged (3 overloads) ─────────────────────

CREATE OR REPLACE FUNCTION public.get_article_ids_by_specialty_paged(
  p_specialty text, p_specialty_match text, p_limit integer, p_offset integer,
  p_subspecialty text DEFAULT NULL::text,
  p_geo_continent text DEFAULT NULL::text, p_geo_region text DEFAULT NULL::text,
  p_geo_country text DEFAULT NULL::text, p_geo_state text DEFAULT NULL::text,
  p_geo_city text DEFAULT NULL::text,
  p_circle integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text
)
RETURNS TABLE(article_id uuid) LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT asp.article_id FROM public.article_specialties asp JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE WHEN p_specialty_match='true'  THEN asp.specialty_match=true
             WHEN p_specialty_match='false' THEN asp.specialty_match=false
             WHEN p_specialty_match='null'  THEN asp.specialty_match IS NULL ELSE true END
    AND (p_subspecialty IS NULL OR a.subspecialty_ai @> ARRAY[p_subspecialty])
    AND (p_circle IS NULL OR a.circle = p_circle)
    AND (p_search IS NULL OR a.title ILIKE '%'||p_search||'%' OR a.journal_abbr ILIKE '%'||p_search||'%')
    AND (
      p_geo_continent IS NULL AND p_geo_region IS NULL AND p_geo_country IS NULL
      AND p_geo_state IS NULL AND p_geo_city IS NULL
      OR EXISTS (
        SELECT 1 FROM public.article_geo_addresses addr WHERE addr.article_id = a.id
          AND (p_geo_continent IS NULL OR addr.continent = p_geo_continent)
          AND (p_geo_region    IS NULL OR addr.region    = p_geo_region)
          AND (p_geo_country   IS NULL OR addr.country   = p_geo_country)
          AND (p_geo_state     IS NULL OR addr.state     = p_geo_state)
          AND (p_geo_city      IS NULL OR addr.city      = p_geo_city)
      )
    )
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_article_ids_by_specialty_paged(
  p_specialty text, p_specialty_match text, p_limit integer, p_offset integer,
  p_subspecialty text DEFAULT NULL::text,
  p_geo_continent text DEFAULT NULL::text, p_geo_region text DEFAULT NULL::text,
  p_geo_country text DEFAULT NULL::text, p_geo_state text DEFAULT NULL::text,
  p_geo_city text DEFAULT NULL::text,
  p_circle integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text,
  p_article_type text DEFAULT NULL::text
)
RETURNS TABLE(article_id uuid) LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT asp.article_id FROM public.article_specialties asp JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE WHEN p_specialty_match='true'  THEN asp.specialty_match=true
             WHEN p_specialty_match='false' THEN asp.specialty_match=false
             WHEN p_specialty_match='null'  THEN asp.specialty_match IS NULL ELSE true END
    AND (p_subspecialty IS NULL OR a.subspecialty_ai @> ARRAY[p_subspecialty])
    AND (p_circle IS NULL OR a.circle = p_circle)
    AND (p_search IS NULL OR a.title ILIKE '%'||p_search||'%' OR a.journal_abbr ILIKE '%'||p_search||'%')
    AND (p_article_type IS NULL OR (p_article_type='Unclassified' AND a.article_type IS NULL) OR (p_article_type<>'Unclassified' AND a.article_type=p_article_type))
    AND (
      p_geo_continent IS NULL AND p_geo_region IS NULL AND p_geo_country IS NULL
      AND p_geo_state IS NULL AND p_geo_city IS NULL
      OR EXISTS (
        SELECT 1 FROM public.article_geo_addresses addr WHERE addr.article_id = a.id
          AND (p_geo_continent IS NULL OR addr.continent = p_geo_continent)
          AND (p_geo_region    IS NULL OR addr.region    = p_geo_region)
          AND (p_geo_country   IS NULL OR addr.country   = p_geo_country)
          AND (p_geo_state     IS NULL OR addr.state     = p_geo_state)
          AND (p_geo_city      IS NULL OR addr.city      = p_geo_city)
      )
    )
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_article_ids_by_specialty_paged(
  p_specialty text, p_specialty_match text, p_limit integer, p_offset integer,
  p_subspecialties text[] DEFAULT NULL::text[],
  p_geo_continent text DEFAULT NULL::text, p_geo_region text DEFAULT NULL::text,
  p_geo_country text DEFAULT NULL::text, p_geo_state text DEFAULT NULL::text,
  p_geo_city text DEFAULT NULL::text,
  p_circle integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text,
  p_article_types text[] DEFAULT NULL::text[],
  p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(article_id uuid) LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT asp.article_id FROM public.article_specialties asp JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE WHEN p_specialty_match='true'  THEN asp.specialty_match=true
             WHEN p_specialty_match='false' THEN asp.specialty_match=false
             WHEN p_specialty_match='null'  THEN asp.specialty_match IS NULL ELSE true END
    AND (p_subspecialties IS NULL OR a.subspecialty_ai && p_subspecialties)
    AND (p_circle IS NULL OR a.circle = p_circle)
    AND (p_search IS NULL OR a.title ILIKE '%'||p_search||'%' OR a.journal_abbr ILIKE '%'||p_search||'%')
    AND (p_date_from IS NULL OR a.published_date >= p_date_from)
    AND (p_date_to   IS NULL OR a.published_date <= p_date_to)
    AND (p_article_types IS NULL OR ('Unclassified'=ANY(p_article_types) AND a.article_type IS NULL) OR a.article_type=ANY(p_article_types))
    AND (
      p_geo_continent IS NULL AND p_geo_region IS NULL AND p_geo_country IS NULL
      AND p_geo_state IS NULL AND p_geo_city IS NULL
      OR EXISTS (
        SELECT 1 FROM public.article_geo_addresses addr WHERE addr.article_id = a.id
          AND (p_geo_continent IS NULL OR addr.continent = p_geo_continent)
          AND (p_geo_region    IS NULL OR addr.region    = p_geo_region)
          AND (p_geo_country   IS NULL OR addr.country   = p_geo_country)
          AND (p_geo_state     IS NULL OR addr.state     = p_geo_state)
          AND (p_geo_city      IS NULL OR addr.city      = p_geo_city)
      )
    )
  LIMIT p_limit OFFSET p_offset;
$function$;

-- ── 17. get_article_ids_by_specialty_paged_multi ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_article_ids_by_specialty_paged_multi(
  p_specialty text, p_specialty_match text, p_limit integer, p_offset integer,
  p_subspecialties text[] DEFAULT NULL::text[],
  p_article_types text[] DEFAULT NULL::text[],
  p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date,
  p_sort_by text DEFAULT 'published_date'::text, p_sort_dir text DEFAULT 'desc'::text,
  p_geo_continent text DEFAULT NULL::text, p_geo_region text DEFAULT NULL::text,
  p_geo_country text DEFAULT NULL::text, p_geo_state text DEFAULT NULL::text,
  p_geo_city text DEFAULT NULL::text,
  p_circle integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text
)
RETURNS TABLE(article_id uuid) LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT asp.article_id FROM public.article_specialties asp JOIN public.articles a ON a.id = asp.article_id
  WHERE asp.specialty = p_specialty
    AND CASE WHEN p_specialty_match='true'  THEN asp.specialty_match=true
             WHEN p_specialty_match='false' THEN asp.specialty_match=false
             WHEN p_specialty_match='null'  THEN asp.specialty_match IS NULL ELSE true END
    AND (p_subspecialties IS NULL OR a.subspecialty_ai && p_subspecialties)
    AND (p_article_types IS NULL OR ('Unclassified'=ANY(p_article_types) AND a.article_type IS NULL) OR a.article_type=ANY(p_article_types))
    AND (p_date_from IS NULL OR a.published_date >= p_date_from)
    AND (p_date_to   IS NULL OR a.published_date <= p_date_to)
    AND (p_circle IS NULL OR a.circle = p_circle)
    AND (p_search IS NULL OR a.title ILIKE '%'||p_search||'%' OR a.journal_abbr ILIKE '%'||p_search||'%')
    AND (
      p_geo_continent IS NULL AND p_geo_region IS NULL AND p_geo_country IS NULL
      AND p_geo_state IS NULL AND p_geo_city IS NULL
      OR EXISTS (
        SELECT 1 FROM public.article_geo_addresses addr WHERE addr.article_id = a.id
          AND (p_geo_continent IS NULL OR addr.continent = p_geo_continent)
          AND (p_geo_region    IS NULL OR addr.region    = p_geo_region)
          AND (p_geo_country   IS NULL OR addr.country   = p_geo_country)
          AND (p_geo_state     IS NULL OR addr.state     = p_geo_state)
          AND (p_geo_city      IS NULL OR addr.city      = p_geo_city)
      )
    )
  ORDER BY
    CASE WHEN p_sort_by='published_date' AND p_sort_dir='desc' THEN a.published_date END DESC NULLS LAST,
    CASE WHEN p_sort_by='published_date' AND p_sort_dir='asc'  THEN a.published_date END ASC  NULLS LAST,
    CASE WHEN p_sort_by='imported_at'    AND p_sort_dir='desc' THEN a.imported_at    END DESC NULLS LAST,
    CASE WHEN p_sort_by='imported_at'    AND p_sort_dir='asc'  THEN a.imported_at    END ASC  NULLS LAST,
    a.published_date DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$function$;
