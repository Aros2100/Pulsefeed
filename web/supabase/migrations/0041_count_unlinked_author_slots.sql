-- Returns the total number of author slots (sum of authors array length)
-- across all articles that have not yet had their authors linked.
CREATE OR REPLACE FUNCTION count_unlinked_author_slots()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $
  SELECT COALESCE(SUM(jsonb_array_length(authors)), 0)
  FROM articles
  WHERE id NOT IN (SELECT article_id FROM article_authors)
    AND authors != '[]'::jsonb
    AND circle IN (1, 2);
$;
