-- Returns distinct non-null values for geo_continent, geo_country, geo_city
-- from the articles table. Using SELECT DISTINCT at the DB level avoids the
-- PostgREST default row-limit that truncates .select() results in the JS client.

CREATE OR REPLACE FUNCTION public.get_article_geo_options()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'continents', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (SELECT DISTINCT geo_continent AS v FROM articles WHERE geo_continent IS NOT NULL) s
    ),
    'countries', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (SELECT DISTINCT geo_country AS v FROM articles WHERE geo_country IS NOT NULL) s
    ),
    'cities', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (SELECT DISTINCT geo_city AS v FROM articles WHERE geo_city IS NOT NULL) s
    )
  );
$$;
