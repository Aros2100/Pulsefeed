CREATE OR REPLACE FUNCTION normalize_author_geo_city()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated integer := 0;
  tmp     integer;
BEGIN
  -- Strip trailing digits/postal codes: "Beijing100070" → "Beijing"
  UPDATE authors
  SET city = regexp_replace(city, '\s*\d[\d\s\-]{2,}$', '', 'g')
  WHERE (verified_by IS NULL OR verified_by != 'human')
    AND city ~ '\s*\d[\d\s\-]{2,}$'
    AND city !~ '^\d'
    AND length(regexp_replace(city, '\s*\d[\d\s\-]{2,}$', '', 'g')) >= 2;
  GET DIAGNOSTICS tmp = ROW_COUNT; updated := updated + tmp;

  -- Strip trailing state codes: "Toronto ON" → "Toronto"
  UPDATE authors
  SET city = trim(regexp_replace(city, '\s+[-–]?\s*[A-Z]{2,3}$', ''))
  WHERE (verified_by IS NULL OR verified_by != 'human')
    AND city ~ '\s+[-–]?\s*[A-Z]{2,3}$'
    AND length(trim(regexp_replace(city, '\s+[-–]?\s*[A-Z]{2,3}$', ''))) >= 2;
  GET DIAGNOSTICS tmp = ROW_COUNT; updated := updated + tmp;

  -- Strip Cedex: "Lyon Cedex 03" → "Lyon"
  UPDATE authors
  SET city = trim(regexp_replace(city, '\s+[Cc]é?dex\b.*$', ''))
  WHERE (verified_by IS NULL OR verified_by != 'human')
    AND city ~* '\s+cedex\b'
    AND length(trim(regexp_replace(city, '\s+[Cc]é?dex\b.*$', ''))) >= 2;
  GET DIAGNOSTICS tmp = ROW_COUNT; updated := updated + tmp;

  -- Apply city_aliases (canonical normalisation)
  UPDATE authors a
  SET city = ca.canonical
  FROM city_aliases ca
  WHERE lower(a.city) = lower(ca.alias)
    AND a.country = ca.country
    AND a.city != ca.canonical
    AND (a.verified_by IS NULL OR a.verified_by != 'human');
  GET DIAGNOSTICS tmp = ROW_COUNT; updated := updated + tmp;

  -- NULL remaining garbage values
  UPDATE authors
  SET city = NULL
  WHERE (verified_by IS NULL OR verified_by != 'human')
    AND city IS NOT NULL
    AND (
      city ~ '^[A-Z]{2,4}$'
      OR city ~ '^\d+'
      OR city ~* '\b(Ave|Street|Blvd|Road|Floor|Hall)\b'
      OR city ~* '\b(Society|Institute|University|Cancer|Hospital)\b'
      OR city ~* '^and\s'
      OR length(city) <= 1
    );
  GET DIAGNOSTICS tmp = ROW_COUNT; updated := updated + tmp;

  RETURN updated;
END;
$$;
