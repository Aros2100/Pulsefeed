-- Fix get_suggested_authors:
-- 1. Use article_specialties join instead of specialty_tags array
-- 2. Normalize legacy subspecialty names (strip commas) before matching

DROP FUNCTION IF EXISTS get_suggested_authors(uuid, text);

CREATE OR REPLACE FUNCTION get_suggested_authors(
  p_user_id     uuid,
  p_user_region text DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  display_name  text,
  country       text,
  city          text,
  hospital      text,
  region        text,
  article_count int
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_subspecialties      text[];
  v_subspecialties_norm text[];
BEGIN
  SELECT subspecialties INTO v_subspecialties
  FROM users
  WHERE id = p_user_id;

  -- Normalise legacy names like "Functional, pain and epilepsy surgery"
  -- by removing commas and collapsing whitespace, matching articles.subspecialty_ai
  SELECT ARRAY(
    SELECT regexp_replace(trim(s), ',\s*', ' ', 'g')
    FROM unnest(v_subspecialties) s
  ) INTO v_subspecialties_norm;

  RETURN QUERY
  SELECT DISTINCT
    a.id,
    a.display_name,
    a.country,
    a.city,
    a.hospital,
    a.region,
    a.article_count
  FROM authors a
  WHERE a.deleted_at IS NULL
    AND a.article_count >= 5
    AND (p_user_region IS NULL OR a.region IS DISTINCT FROM p_user_region)
    AND EXISTS (
      SELECT 1
      FROM article_authors aa
      JOIN articles art ON art.id = aa.article_id
      JOIN article_specialties asp ON asp.article_id = art.id
      WHERE aa.author_id = a.id
        AND asp.specialty = 'neurosurgery'
        AND asp.specialty_match = true
        AND (
          v_subspecialties_norm IS NULL
          OR array_length(v_subspecialties_norm, 1) = 0
          OR art.subspecialty_ai && v_subspecialties_norm
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM author_follows af
      WHERE af.user_id = p_user_id AND af.author_id = a.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM author_dismissals ad
      WHERE ad.user_id = p_user_id AND ad.author_id = a.id
    )
  ORDER BY a.article_count DESC
  LIMIT 10;
END;
$$;
