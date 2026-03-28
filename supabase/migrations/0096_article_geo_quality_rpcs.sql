-- count_article_suspect_city_values: articles with garbage geo_city values
CREATE OR REPLACE FUNCTION count_article_suspect_city_values()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)
  FROM articles
  WHERE geo_city IS NOT NULL
    AND (
      geo_city ~ '^\d'                  -- starts with digit
      OR geo_city ~ '\d{4}'             -- contains 4+ consecutive digits
      OR geo_city ~ '^[A-Z]{2,4}$'     -- all-uppercase 2–4 chars (e.g. "NYC", "BCN")
      OR geo_city ~ '\d-\d'             -- digit-dash-digit
      OR geo_city ILIKE '%Ave%'
      OR geo_city ILIKE '%Street%'
      OR geo_city ILIKE '%Blvd%'
      OR geo_city ILIKE '%Road%'
      OR geo_city ILIKE '% Floor%'
      OR geo_city ILIKE '% Hall%'
      OR geo_city ILIKE '%Society%'
      OR geo_city ILIKE '%Institute%'
      OR geo_city ILIKE '%University%'
      OR geo_city ILIKE '%Cancer%'
      OR geo_city ILIKE '%Hospital%'
      OR geo_city ILIKE '%MR-Centre%'
      OR geo_city ILIKE '%cedex%'
      OR geo_city ILIKE 'and %'
    );
$$;

-- count_distinct_geo_regions: number of distinct geo_region values across all articles
CREATE OR REPLACE FUNCTION count_distinct_geo_regions()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(DISTINCT geo_region)
  FROM articles
  WHERE geo_region IS NOT NULL;
$$;

-- count_city_alias_resolved: articles whose geo_city matches a canonical value in city_aliases
CREATE OR REPLACE FUNCTION count_city_alias_resolved()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)
  FROM articles
  WHERE geo_city IS NOT NULL
    AND lower(geo_city) IN (SELECT lower(canonical) FROM city_aliases);
$$;
