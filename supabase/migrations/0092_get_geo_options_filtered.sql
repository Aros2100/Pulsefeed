-- get_geo_options_filtered: returns distinct geo field values with optional
-- context filters. Used by /api/admin/articles/geo-options for drill-down.

CREATE OR REPLACE FUNCTION get_geo_options_filtered(
  p_field     text,
  p_continent text DEFAULT NULL,
  p_country   text DEFAULT NULL,
  p_state     text DEFAULT NULL
) RETURNS text[] AS $$
DECLARE
  result text[];
BEGIN
  IF p_field = 'geo_continent' THEN
    SELECT ARRAY(
      SELECT DISTINCT geo_continent FROM articles
      WHERE  geo_continent IS NOT NULL
      ORDER  BY geo_continent
    ) INTO result;

  ELSIF p_field = 'geo_country' THEN
    SELECT ARRAY(
      SELECT DISTINCT geo_country FROM articles
      WHERE  geo_country IS NOT NULL
        AND  (p_continent IS NULL OR geo_continent = p_continent)
      ORDER  BY geo_country
    ) INTO result;

  ELSIF p_field = 'geo_state' THEN
    SELECT ARRAY(
      SELECT DISTINCT geo_state FROM articles
      WHERE  geo_state IS NOT NULL
        AND  (p_country IS NULL OR geo_country = p_country)
      ORDER  BY geo_state
    ) INTO result;

  ELSIF p_field = 'geo_city' THEN
    SELECT ARRAY(
      SELECT DISTINCT geo_city FROM articles
      WHERE  geo_city IS NOT NULL
        AND  (p_state   IS NULL OR geo_state   = p_state)
        AND  (p_state   IS NOT NULL OR p_country IS NULL OR geo_country = p_country)
      ORDER  BY geo_city
    ) INTO result;

  END IF;

  RETURN COALESCE(result, '{}');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
