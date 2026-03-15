CREATE OR REPLACE FUNCTION get_authors_city_not_in_geonames(p_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid,
  display_name text,
  affiliations text[],
  city text,
  country text,
  hospital text,
  department text,
  state text,
  article_count int
)
LANGUAGE sql STABLE
AS $fn$
  SELECT a.id, a.display_name, a.affiliations, a.city, a.country,
         a.hospital, a.department, a.state, a.article_count
  FROM authors a
  WHERE a.affiliations IS NOT NULL
    AND a.affiliations != '{}'
    AND a.city IS NOT NULL
    AND lower(a.city) NOT IN (SELECT lower(name) FROM geo_cities)
    AND NOT EXISTS (
      SELECT 1 FROM lab_decisions ld
      WHERE ld.author_id = a.id AND ld.module = 'author_geo'
    )
  ORDER BY a.article_count DESC NULLS LAST
  LIMIT p_limit;
$fn$;
