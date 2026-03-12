CREATE OR REPLACE FUNCTION get_geo_cities_week(p_since timestamptz, p_country text)
RETURNS TABLE(city text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT c AS city, count(*) AS count
  FROM articles, unnest(article_cities) AS c
  WHERE imported_at >= p_since
    AND p_country = ANY(article_countries)
    AND article_cities IS NOT NULL AND article_cities != '{}'
  GROUP BY c
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION get_geo_articles_week(p_since timestamptz, p_city text)
RETURNS TABLE(id uuid, title text, journal_abbr text, published_date text)
LANGUAGE sql STABLE
AS $$
  SELECT a.id, a.title, a.journal_abbr, a.published_date::text
  FROM articles a
  WHERE a.imported_at >= p_since
    AND p_city = ANY(a.article_cities)
  ORDER BY a.published_date DESC NULLS LAST
  LIMIT 100;
$$;
