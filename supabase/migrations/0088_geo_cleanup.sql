-- Geo field cleanup.
-- 1. Rename first_author_department → geo_department
-- 2. Drop redundant first/last author columns, legacy arrays, and certainty flags
-- 3. Update geo RPCs to use scalar geo_* fields instead of arrays

-- ── 1. Rename ────────────────────────────────────────────────────────────────

ALTER TABLE articles RENAME COLUMN first_author_department TO geo_department;

-- ── 2. Drop columns ──────────────────────────────────────────────────────────

ALTER TABLE articles
  DROP COLUMN IF EXISTS first_author_city,
  DROP COLUMN IF EXISTS first_author_country,
  DROP COLUMN IF EXISTS first_author_institution,
  DROP COLUMN IF EXISTS first_author_region,
  DROP COLUMN IF EXISTS last_author_city,
  DROP COLUMN IF EXISTS last_author_country,
  DROP COLUMN IF EXISTS last_author_department,
  DROP COLUMN IF EXISTS last_author_institution,
  DROP COLUMN IF EXISTS last_author_region,
  DROP COLUMN IF EXISTS article_institutions,
  DROP COLUMN IF EXISTS article_regions,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS geographic_region,
  DROP COLUMN IF EXISTS geo_city_certain,
  DROP COLUMN IF EXISTS geo_country_certain,
  DROP COLUMN IF EXISTS geo_institution_certain,
  DROP COLUMN IF EXISTS geo_state_certain;

-- ── 3. Update RPCs ───────────────────────────────────────────────────────────

-- get_geo_cities_week: was using article_cities array + p_country = ANY(article_countries)
CREATE OR REPLACE FUNCTION public.get_geo_cities_week(p_since timestamptz, p_country text)
RETURNS TABLE(city text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT geo_city AS city, count(*) AS count
  FROM articles
  WHERE imported_at >= p_since
    AND geo_country = p_country
    AND geo_city IS NOT NULL
  GROUP BY geo_city
  ORDER BY count DESC;
$$;

-- get_geo_countries_week: was using article_regions/article_countries arrays
CREATE OR REPLACE FUNCTION public.get_geo_countries_week(p_since timestamptz)
RETURNS TABLE(region text, country text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT geo_region AS region, geo_country AS country, count(*) AS count
  FROM articles
  WHERE imported_at >= p_since
    AND geo_region IS NOT NULL
    AND geo_country IS NOT NULL
  GROUP BY geo_region, geo_country
  ORDER BY count DESC;
$$;

-- get_geo_regions_week: was using article_regions array
CREATE OR REPLACE FUNCTION public.get_geo_regions_week(p_since timestamptz)
RETURNS TABLE(region text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT geo_region AS region, count(*) AS count
  FROM articles
  WHERE imported_at >= p_since
    AND geo_region IS NOT NULL
  GROUP BY geo_region
  ORDER BY count DESC;
$$;
