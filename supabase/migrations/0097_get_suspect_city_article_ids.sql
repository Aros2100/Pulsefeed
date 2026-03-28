CREATE OR REPLACE FUNCTION get_suspect_city_article_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM articles
  WHERE geo_city IS NOT NULL AND (
    geo_city ~ '^\d'
    OR geo_city ~ '\d{4}'
    OR geo_city ~ '^[A-Z]{2,4}$'
    OR geo_city ~ '\d+-\d+'
    OR geo_city ~* '\b(Ave|Street|Blvd|Road|Floor|Hall)\b'
    OR geo_city ~* '\b(Society|Institute|University|Cancer|Hospital|MR-Centre)\b'
    OR geo_city ~* 'cedex'
    OR geo_city ~* '^and\s'
  );
$$;
