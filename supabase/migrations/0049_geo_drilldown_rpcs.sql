-- 5-level geo drill-down RPCs using geo_* fields
-- Levels: continents → regions → countries → cities → articles

CREATE OR REPLACE FUNCTION get_geo_continents(p_since date DEFAULT NULL)
RETURNS TABLE(continent text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT geo_continent AS continent, count(*) AS count
  FROM articles
  WHERE (p_since IS NULL OR indexed_date > p_since)
    AND geo_continent IS NOT NULL
  GROUP BY geo_continent
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION get_geo_regions(p_since date DEFAULT NULL, p_continent text DEFAULT NULL)
RETURNS TABLE(region text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT geo_region AS region, count(*) AS count
  FROM articles
  WHERE (p_since IS NULL OR indexed_date > p_since)
    AND geo_region IS NOT NULL
    AND (p_continent IS NULL OR geo_continent = p_continent)
  GROUP BY geo_region
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION get_geo_countries(p_since date DEFAULT NULL, p_region text DEFAULT NULL)
RETURNS TABLE(country text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT geo_country AS country, count(*) AS count
  FROM articles
  WHERE (p_since IS NULL OR indexed_date > p_since)
    AND geo_country IS NOT NULL
    AND (p_region IS NULL OR geo_region = p_region)
  GROUP BY geo_country
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION get_geo_cities(p_since date DEFAULT NULL, p_country text DEFAULT NULL)
RETURNS TABLE(city text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT geo_city AS city, count(*) AS count
  FROM articles
  WHERE (p_since IS NULL OR indexed_date > p_since)
    AND geo_city IS NOT NULL
    AND (p_country IS NULL OR geo_country = p_country)
  GROUP BY geo_city
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION get_geo_articles(p_since date DEFAULT NULL, p_city text DEFAULT NULL)
RETURNS TABLE(id uuid, title text, journal_abbr text, published_date text)
LANGUAGE sql STABLE
AS $$
  SELECT a.id, a.title, a.journal_abbr, a.published_date::text
  FROM articles a
  WHERE (p_since IS NULL OR a.indexed_date > p_since)
    AND a.geo_city = p_city
  ORDER BY a.published_date DESC NULLS LAST
  LIMIT 100;
$$;
