CREATE OR REPLACE FUNCTION get_author_verification_stats()
RETURNS TABLE (
  human        bigint,
  uverificeret bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE verified_by = 'human')                          AS human,
    COUNT(*) FILTER (WHERE verified_by = 'uverificeret' OR verified_by IS NULL) AS uverificeret
  FROM authors;
$$;
