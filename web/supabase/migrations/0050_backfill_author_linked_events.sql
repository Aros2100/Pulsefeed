INSERT INTO article_events (article_id, event_type, payload, created_at)
SELECT
  aa.article_id,
  'author_linked',
  jsonb_build_object(
    'authors_linked', COUNT(*),
    'backfilled', true
  ),
  MIN(aa.created_at)
FROM article_authors aa
WHERE NOT EXISTS (
  SELECT 1 FROM article_events ae
  WHERE ae.article_id = aa.article_id
  AND ae.event_type = 'author_linked'
)
GROUP BY aa.article_id;
