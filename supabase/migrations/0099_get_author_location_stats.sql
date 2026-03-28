CREATE OR REPLACE FUNCTION get_author_location_stats()
RETURNS TABLE(
  with_country         bigint,
  with_city            bigint,
  no_country           bigint,
  no_city              bigint,
  no_geo               bigint,
  affiliation_too_long bigint,
  suspect_city_values  bigint,
  source_openalex      bigint,
  source_parser        bigint,
  verified_human       bigint,
  total_authors        bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE country IS NOT NULL)                       AS with_country,
    COUNT(*) FILTER (WHERE city IS NOT NULL)                          AS with_city,
    COUNT(*) FILTER (WHERE country IS NULL)                           AS no_country,
    COUNT(*) FILTER (WHERE city IS NULL)                              AS no_city,
    COUNT(*) FILTER (WHERE country IS NULL AND city IS NULL)          AS no_geo,
    COUNT(*) FILTER (WHERE char_length(affiliations::text) > 500)     AS affiliation_too_long,
    COUNT(*) FILTER (WHERE city IS NOT NULL AND (
      city ~ '^\d'
      OR city ~ '\d{4}'
      OR city ~ '^[A-Z]{2,4}$'
      OR city ~ '\d+-\d+'
      OR city ~* '\b(Ave|Street|Blvd|Road|Floor|Hall)\b'
      OR city ~* '\b(Society|Institute|University|Cancer|Hospital|MR-Centre)\b'
      OR city ~* 'cedex'
      OR city ~* '^and\s'
    ))                                                                AS suspect_city_values,
    COUNT(*) FILTER (WHERE geo_source = 'openalex')                   AS source_openalex,
    COUNT(*) FILTER (WHERE geo_source = 'parser')                     AS source_parser,
    COUNT(*) FILTER (WHERE verified_by = 'human')                     AS verified_human,
    COUNT(*)                                                          AS total_authors
  FROM authors
  WHERE deleted_at IS NULL;
$$;
