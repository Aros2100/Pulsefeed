CREATE OR REPLACE FUNCTION find_author_duplicates(
  p_match_country  boolean DEFAULT true,
  p_match_state    boolean DEFAULT false,
  p_match_city     boolean DEFAULT true,
  p_match_hospital boolean DEFAULT false,
  p_last_name_chars          integer  DEFAULT 4,
  p_exclude_countries        text[]   DEFAULT ARRAY['China', 'South Korea', 'Japan'],
  p_max_group_size           integer  DEFAULT 8,
  p_match_firstname_initial  boolean  DEFAULT true,
  p_exact_lastname           boolean  DEFAULT true
)
RETURNS TABLE (
  author_ids    uuid[],
  display_names text[],
  group_size    integer
)
LANGUAGE sql
SECURITY DEFINER
AS $fn$
  WITH
  -- Extract last name and first name initial for each author
  author_names AS (
    SELECT
      id,
      display_name,
      regexp_replace(coalesce(display_name_normalized, ''), '^.* ', '') AS last_name,
      left(regexp_replace(coalesce(display_name_normalized, ''), ' [^ ]* ', ''), 1) AS firstname_initial,
      country, state, city, hospital
    FROM authors
    WHERE display_name_normalized IS NOT NULL
      AND display_name_normalized <> ''
  ),
  -- Find candidate pairs
  pairs AS (
    SELECT
      LEAST(a1.id, a2.id)    AS id_lo,
      GREATEST(a1.id, a2.id) AS id_hi
    FROM author_names a1
    JOIN author_names a2 ON a1.id < a2.id
    WHERE
      -- Last name match: exact or prefix-based
      a1.last_name <> ''
      AND a2.last_name <> ''
      AND (
        (p_exact_lastname AND a1.last_name = a2.last_name)
        OR
        (NOT p_exact_lastname
         AND left(a1.last_name, p_last_name_chars) = left(a2.last_name, p_last_name_chars)
         AND abs(length(a1.last_name) - length(a2.last_name)) <= 3)
      )

      -- First name initial must match if enabled
      AND (NOT p_match_firstname_initial
           OR a1.firstname_initial = a2.firstname_initial)

      -- At least one active geo parameter must match on non-null values
      AND (
        (p_match_country  AND a1.country  IS NOT NULL AND a1.country  = a2.country)
        OR (p_match_state    AND a1.state    IS NOT NULL AND a1.state    = a2.state)
        OR (p_match_city     AND a1.city     IS NOT NULL AND a1.city     = a2.city)
        OR (p_match_hospital AND a1.hospital IS NOT NULL AND a1.hospital = a2.hospital)
      )
      -- Stricter filters: if enabled, must not conflict
      AND (NOT p_match_country  OR a1.country  IS NULL OR a2.country  IS NULL OR a1.country  = a2.country)
      AND (NOT p_match_state    OR a1.state    IS NULL OR a2.state    IS NULL OR a1.state    = a2.state)
      AND (NOT p_match_city     OR a1.city     IS NULL OR a2.city     IS NULL OR a1.city     = a2.city)
      AND (NOT p_match_hospital OR a1.hospital IS NULL OR a2.hospital IS NULL OR a1.hospital = a2.hospital)
  ),
  -- Flatten pairs to (group_anchor, member_id)
  -- Each author belongs to the group of their minimum connected id_lo
  flat AS (
    SELECT id_lo AS anchor, id_lo AS member_id FROM pairs
    UNION
    SELECT id_lo AS anchor, id_hi AS member_id FROM pairs
  ),
  -- Assign canonical group: each member gets the minimum anchor across all their pairs
  canonical AS (
    SELECT
      MIN(anchor::text)::uuid AS group_key,
      member_id
    FROM flat
    GROUP BY member_id
  ),
  -- Join back to get display names
  grouped AS (
    SELECT
      c.group_key,
      a.id,
      a.display_name,
      a.country
    FROM canonical c
    JOIN authors a ON a.id = c.member_id
  )
  SELECT
    array_agg(g.id           ORDER BY g.id) AS author_ids,
    array_agg(g.display_name ORDER BY g.id) AS display_names,
    count(g.id)::integer                    AS group_size
  FROM grouped g
  GROUP BY g.group_key
  HAVING count(g.id) >= 2
    AND count(g.id) <= p_max_group_size
    AND NOT bool_and(g.country = ANY(p_exclude_countries))
  ORDER BY count(g.id) DESC;
$fn$;
