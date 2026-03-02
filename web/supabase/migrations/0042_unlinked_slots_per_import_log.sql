-- Returns the number of unlinked author slots for each of the given import log IDs.
-- Matches articles by imported_at falling within the import run's time window.
CREATE OR REPLACE FUNCTION unlinked_author_slots_for_import_logs(p_ids uuid[])
RETURNS TABLE(import_log_id uuid, slots bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT il.id AS import_log_id,
         COALESCE(SUM(jsonb_array_length(a.authors)), 0) AS slots
  FROM import_logs il
  LEFT JOIN articles a ON
    a.imported_at >= il.started_at
    AND a.imported_at <= COALESCE(il.completed_at, NOW())
    AND a.id NOT IN (SELECT article_id FROM article_authors)
    AND a.authors != '[]'::jsonb
    AND a.circle IN (1, 2)
  WHERE il.id = ANY(p_ids)
  GROUP BY il.id;
$$;
