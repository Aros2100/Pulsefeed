-- Allow 'ror' as a valid geo_source value
ALTER TABLE authors DROP CONSTRAINT IF EXISTS chk_authors_geo_source;
ALTER TABLE authors
  ADD CONSTRAINT chk_authors_geo_source
  CHECK (geo_source IN ('ror', 'openalex', 'parser', 'manual', 'ai'));

-- Update get_author_location_stats to use 'ror' instead of 'openalex'
DROP FUNCTION IF EXISTS get_author_location_stats();
CREATE OR REPLACE FUNCTION get_author_location_stats()
RETURNS TABLE(
  with_region          bigint,
  with_country         bigint,
  with_state           bigint,
  with_city            bigint,
  distinct_regions     bigint,
  no_region            bigint,
  no_country           bigint,
  no_state             bigint,
  no_city              bigint,
  no_geo               bigint,
  affiliation_too_long bigint,
  suspect_city_values  bigint,
  source_ror           bigint,
  source_parser        bigint,
  verified_human       bigint,
  total_authors        bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE region IS NOT NULL)                        AS with_region,
    COUNT(*) FILTER (WHERE country IS NOT NULL)                       AS with_country,
    COUNT(*) FILTER (WHERE state IS NOT NULL)                         AS with_state,
    COUNT(*) FILTER (WHERE city IS NOT NULL)                          AS with_city,
    COUNT(DISTINCT region) FILTER (WHERE region IS NOT NULL)          AS distinct_regions,
    COUNT(*) FILTER (WHERE country IS NOT NULL AND region IS NULL)    AS no_region,
    COUNT(*) FILTER (WHERE country IS NULL)                           AS no_country,
    COUNT(*) FILTER (WHERE country IS NOT NULL AND state IS NULL)     AS no_state,
    COUNT(*) FILTER (WHERE country IS NOT NULL AND city IS NULL)      AS no_city,
    COUNT(*) FILTER (WHERE country IS NULL AND city IS NULL)          AS no_geo,
    COUNT(*) FILTER (WHERE char_length(affiliations::text) > 500)    AS affiliation_too_long,
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
    COUNT(*) FILTER (WHERE geo_source = 'ror')                       AS source_ror,
    COUNT(*) FILTER (WHERE geo_source = 'parser')                    AS source_parser,
    COUNT(*) FILTER (WHERE verified_by = 'human')                    AS verified_human,
    COUNT(*)                                                         AS total_authors
  FROM authors
  WHERE deleted_at IS NULL;
$$;
