-- Track authors dismissed by a user from the suggestion list.
CREATE TABLE IF NOT EXISTS author_dismissals (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES authors(id)    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, author_id)
);

ALTER TABLE author_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own dismissals"
  ON author_dismissals
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RPC: return up to 10 suggested authors for a given user.
-- Filters: ≥5 approved neurosurgery articles, region different from user,
--          not already followed, not previously dismissed.
CREATE OR REPLACE FUNCTION get_suggested_authors(
  p_user_id    uuid,
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
  v_subspecialties text[];
BEGIN
  SELECT subspecialties INTO v_subspecialties
  FROM users
  WHERE id = p_user_id;

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
      WHERE aa.author_id = a.id
        AND art.status = 'approved'
        AND 'neurosurgery' = ANY(art.specialty_tags)
        AND (
          v_subspecialties IS NULL
          OR array_length(v_subspecialties, 1) = 0
          OR art.subspecialty_ai && v_subspecialties
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
