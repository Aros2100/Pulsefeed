-- Remove duplicate "imported" events caused by the re-import upsert bug.
-- For articles with more than one imported event, keep the FIRST (oldest)
-- and delete all subsequent ones.
DELETE FROM article_events
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY article_id ORDER BY created_at ASC) AS rn
    FROM article_events
    WHERE event_type = 'imported'
  ) sub
  WHERE rn > 1
);
