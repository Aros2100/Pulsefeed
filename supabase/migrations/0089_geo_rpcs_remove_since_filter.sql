-- Remove imported_at >= p_since filter from geo week RPCs so they return all articles.
-- p_since parameter kept in signatures for backwards compatibility but is now ignored.

CREATE OR REPLACE FUNCTION public.get_geo_regions_week(p_since timestamptz)
RETURNS TABLE(region text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT geo_region AS region, count(*) AS count
  FROM articles
  WHERE geo_region IS NOT NULL
  GROUP BY geo_region
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_geo_countries_week(p_since timestamptz)
RETURNS TABLE(region text, country text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT geo_region AS region, geo_country AS country, count(*) AS count
  FROM articles
  WHERE geo_region IS NOT NULL
    AND geo_country IS NOT NULL
  GROUP BY geo_region, geo_country
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_geo_cities_week(p_since timestamptz, p_country text)
RETURNS TABLE(city text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT geo_city AS city, count(*) AS count
  FROM articles
  WHERE geo_country = p_country
    AND geo_city IS NOT NULL
  GROUP BY geo_city
  ORDER BY count DESC;
$$;
