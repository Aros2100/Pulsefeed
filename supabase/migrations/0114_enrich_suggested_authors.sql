-- Enrich get_suggested_authors with last_article_date, top_mesh_terms
-- and a p_subspecialty filter for tab-based browsing.

DROP FUNCTION IF EXISTS get_suggested_authors(uuid, text);

CREATE OR REPLACE FUNCTION get_suggested_authors(
  p_user_id      uuid,
  p_user_country text DEFAULT NULL,
  p_subspecialty text DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  display_name      text,
  country           text,
  city              text,
  hospital          text,
  region            text,
  article_count     int,
  last_article_date text,
  top_mesh_terms    text[]
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_subspecialties      text[];
  v_subspecialties_norm text[];
BEGIN
  SELECT subspecialties INTO v_subspecialties
  FROM users
  WHERE id = p_user_id;

  SELECT ARRAY(
    SELECT regexp_replace(trim(s), ',\s*', ' ', 'g')
    FROM unnest(v_subspecialties) s
  ) INTO v_subspecialties_norm;

  RETURN QUERY
  SELECT
    a.id,
    a.display_name,
    a.country,
    a.city,
    a.hospital,
    a.region,
    a.article_count,

    -- Most recent approved article date, formatted as "Mon YYYY"
    (
      SELECT to_char(MAX(art2.published_date::date), 'Mon YYYY')
      FROM article_authors aa2
      JOIN articles art2 ON art2.id = aa2.article_id
      WHERE aa2.author_id = a.id
        AND art2.status = 'approved'
    ) AS last_article_date,

    -- Top 3 MeSH descriptors by frequency in the author's neurosurgery articles
    ARRAY(
      SELECT mt
      FROM (
        SELECT elem->>'descriptor' AS mt, COUNT(*) AS cnt
        FROM article_authors aa2
        JOIN articles art2    ON art2.id = aa2.article_id
        JOIN article_specialties asp2 ON asp2.article_id = art2.id
        CROSS JOIN LATERAL jsonb_array_elements(art2.mesh_terms) AS elem
        WHERE aa2.author_id = a.id
          AND asp2.specialty = 'neurosurgery'
          AND asp2.specialty_match = true
          AND elem->>'descriptor' IS NOT NULL
          AND elem->>'descriptor' NOT IN (
            'Humans', 'Male', 'Female', 'Adult', 'Aged', 'Middle Aged',
            'Aged, 80 and over', 'Young Adult', 'Adolescent', 'Child',
            'Child, Preschool', 'Infant', 'Infant, Newborn', 'Animals',
            'Retrospective Studies', 'Prospective Studies', 'Follow-Up Studies',
            'Cohort Studies', 'Treatment Outcome', 'Risk Factors', 'Prognosis'
          )
        GROUP BY elem->>'descriptor'
        ORDER BY cnt DESC
        LIMIT 3
      ) t
    ) AS top_mesh_terms

  FROM authors a
  WHERE a.deleted_at IS NULL
    AND a.article_count >= 5
    AND (p_user_country IS NULL OR a.country IS DISTINCT FROM p_user_country)
    AND EXISTS (
      SELECT 1
      FROM article_authors aa
      JOIN articles art ON art.id = aa.article_id
      JOIN article_specialties asp ON asp.article_id = art.id
      WHERE aa.author_id = a.id
        AND asp.specialty = 'neurosurgery'
        AND asp.specialty_match = true
        AND (
          CASE
            WHEN p_subspecialty IS NOT NULL
              THEN p_subspecialty = ANY(art.subspecialty_ai)
            WHEN v_subspecialties_norm IS NULL
              OR array_length(v_subspecialties_norm, 1) = 0
              THEN true
            ELSE art.subspecialty_ai && v_subspecialties_norm
          END
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
