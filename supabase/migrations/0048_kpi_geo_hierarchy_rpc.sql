CREATE OR REPLACE FUNCTION get_kpi_geo_hierarchy(
  p_period text,
  p_subspecialty text DEFAULT NULL,
  p_continent text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_latest_date date;
  v_since date;
  v_all bigint;
  v_continent bigint;
  v_region bigint;
  v_country bigint;
  v_city bigint;
BEGIN
  SELECT max(indexed_date) INTO v_latest_date FROM articles;
  IF v_latest_date IS NULL THEN
    RETURN '{"all":0,"continent":0,"region":0,"country":0,"city":0}'::jsonb;
  END IF;

  v_since := CASE p_period
    WHEN 'week' THEN v_latest_date - 7
    WHEN 'month' THEN v_latest_date - 30
    WHEN 'year' THEN v_latest_date - 365
    ELSE v_latest_date - 7
  END;

  SELECT count(*) INTO v_all FROM articles
  WHERE indexed_date > v_since
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(subspecialty_ai));

  SELECT count(*) INTO v_continent FROM articles
  WHERE indexed_date > v_since AND geo_continent = p_continent
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(subspecialty_ai));

  SELECT count(*) INTO v_region FROM articles
  WHERE indexed_date > v_since AND geo_region = p_region
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(subspecialty_ai));

  SELECT count(*) INTO v_country FROM articles
  WHERE indexed_date > v_since AND geo_country = p_country
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(subspecialty_ai));

  SELECT count(*) INTO v_city FROM articles
  WHERE indexed_date > v_since AND geo_city = p_city
    AND (p_subspecialty IS NULL OR p_subspecialty = ANY(subspecialty_ai));

  RETURN jsonb_build_object(
    'all', v_all,
    'continent', v_continent,
    'region', v_region,
    'country', v_country,
    'city', v_city
  );
END;
$$;
