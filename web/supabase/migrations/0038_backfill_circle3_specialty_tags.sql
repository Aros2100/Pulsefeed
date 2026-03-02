-- Backfill specialty_tags for circle=3 articles that had their tags cleared
-- by the old rejection code. These articles have no specialty association in
-- specialty_tags, so the import overview RPC cannot find them.
--
-- Since circle=3 articles were originally circle=2 articles imported via
-- circle_2_sources (which are specialty-specific), we can recover the
-- specialty by joining through the import chain.
--
-- Fallback: for circle=3 articles that still have specialty_tags='{}',
-- set specialty_tags based on the most recent lab_decision for that article.
UPDATE articles a
SET specialty_tags = ARRAY[ld.specialty]
FROM (
  SELECT DISTINCT ON (article_id) article_id, specialty
  FROM lab_decisions
  ORDER BY article_id, decided_at DESC
) ld
WHERE a.id = ld.article_id
  AND a.circle = 3
  AND a.specialty_tags = '{}';
