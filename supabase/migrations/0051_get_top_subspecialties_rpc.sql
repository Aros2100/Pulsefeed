-- RPC: Get top subspecialties by article count
CREATE OR REPLACE FUNCTION get_top_subspecialties(p_limit int DEFAULT 3)
RETURNS TABLE(tag text, count bigint)
LANGUAGE sql STABLE
AS $fn$
  SELECT tag, count(*) as count
  FROM articles, unnest(subspecialty_ai) as tag
  WHERE subspecialty_ai IS NOT NULL
    AND subspecialty_ai != '{}'
    AND tag != 'Unknown'
    AND status = 'approved'
  GROUP BY tag
  ORDER BY count DESC
  LIMIT p_limit;
$fn$;
