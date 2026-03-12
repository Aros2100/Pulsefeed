-- Regions aggregated for articles imported since a given timestamp
CREATE OR REPLACE FUNCTION get_geo_regions_week(p_since timestamptz)
RETURNS TABLE(region text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT unnest(article_regions) AS region, count(*) AS count
  FROM articles
  WHERE imported_at >= p_since
    AND article_regions IS NOT NULL
    AND article_regions != '{}'
  GROUP BY region
  ORDER BY count DESC;
$$;

-- Countries per region for articles imported since a given timestamp
CREATE OR REPLACE FUNCTION get_geo_countries_week(p_since timestamptz)
RETURNS TABLE(region text, country text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT unnest(article_regions) AS region,
         unnest(article_countries) AS country,
         count(*) AS count
  FROM articles
  WHERE imported_at >= p_since
    AND article_regions IS NOT NULL AND article_regions != '{}'
    AND article_countries IS NOT NULL AND article_countries != '{}'
  GROUP BY region, country
  ORDER BY count DESC;
$$;
