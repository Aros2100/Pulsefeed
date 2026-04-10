-- count_unlinked_articles: extend circle IN (1,2,3) → (1,2,3,4)
CREATE OR REPLACE FUNCTION public.count_unlinked_articles()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM articles a
  WHERE NOT EXISTS (
    SELECT 1 FROM article_authors aa WHERE aa.article_id = a.id
  )
    AND a.circle IN (1, 2, 3, 4);
$$;

-- count_unlinked_author_slots: extend circle IN (1,2) → (1,2,3,4)
CREATE OR REPLACE FUNCTION public.count_unlinked_author_slots()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(jsonb_array_length(authors)), 0)::bigint
  FROM articles
  WHERE id NOT IN (SELECT article_id FROM article_authors)
    AND authors != '[]'::jsonb
    AND circle IN (1, 2, 3, 4);
$$;

-- unlinked_author_slots_for_import_logs: extend circle IN (1,2) → (1,2,3,4)
CREATE OR REPLACE FUNCTION public.unlinked_author_slots_for_import_logs(p_ids uuid[])
RETURNS TABLE(import_log_id uuid, slots bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT il.id AS import_log_id,
         COALESCE(SUM(jsonb_array_length(a.authors)), 0) AS slots
  FROM import_logs il
  LEFT JOIN articles a ON
    a.imported_at >= il.started_at
    AND a.imported_at <= COALESCE(il.completed_at, NOW())
    AND a.id NOT IN (SELECT article_id FROM article_authors)
    AND a.authors != '[]'::jsonb
    AND a.circle IN (1, 2, 3, 4)
  WHERE il.id = ANY(p_ids)
  GROUP BY il.id;
$$;
