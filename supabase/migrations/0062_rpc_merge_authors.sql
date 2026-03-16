SET check_function_bodies = off;

-- Merge duplicate authors into a single master record.
-- All FK references to a slave are re-pointed to the master or removed.
-- ORCID and openalex_id are copied to master if master lacks them.
-- Slave author rows are deleted after all FK references are resolved.
CREATE OR REPLACE FUNCTION merge_authors(
  p_master_id uuid,
  p_slave_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slave uuid;
BEGIN
  IF p_master_id IS NULL OR array_length(p_slave_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'merge_authors: master_id and at least one slave_id required';
  END IF;

  IF p_master_id = ANY(p_slave_ids) THEN
    RAISE EXCEPTION 'merge_authors: master_id must not appear in slave_ids';
  END IF;

  FOREACH v_slave IN ARRAY p_slave_ids LOOP

    DECLARE
      v_slave_orcid      text;
      v_slave_openalex_id text;
    BEGIN
      SELECT orcid, openalex_id
        INTO v_slave_orcid, v_slave_openalex_id
        FROM authors WHERE id = v_slave;

      -- NULL slave unique fields FIRST (avoid constraint violations)
      UPDATE authors SET orcid = NULL, openalex_id = NULL WHERE id = v_slave;

      -- Then copy to master (only if master lacks them)
      UPDATE authors SET orcid        = COALESCE(orcid,        v_slave_orcid)       WHERE id = p_master_id;
      UPDATE authors SET openalex_id  = COALESCE(openalex_id,  v_slave_openalex_id) WHERE id = p_master_id;
    END;

    -- 1. article_authors: re-point, skip duplicates, delete remaining
    UPDATE article_authors
    SET author_id = p_master_id
    WHERE author_id = v_slave
      AND NOT EXISTS (
        SELECT 1 FROM article_authors aa2
        WHERE aa2.article_id = article_authors.article_id
          AND aa2.author_id  = p_master_id
      );
    DELETE FROM article_authors WHERE author_id = v_slave;

    -- 2. lab_decisions: drop conflicts, re-point the rest
    DELETE FROM lab_decisions
    WHERE author_id = v_slave
      AND article_id IN (
        SELECT article_id FROM lab_decisions WHERE author_id = p_master_id
      );
    UPDATE lab_decisions SET author_id = p_master_id WHERE author_id = v_slave;

    -- 3. author_follows: drop conflicts, re-point the rest
    DELETE FROM author_follows
    WHERE author_id = v_slave
      AND user_id IN (
        SELECT user_id FROM author_follows WHERE author_id = p_master_id
      );
    UPDATE author_follows SET author_id = p_master_id WHERE author_id = v_slave;

    -- 4. author_events: re-point all rows
    UPDATE author_events SET author_id = p_master_id WHERE author_id = v_slave;

    -- 5. users: unlink slave
    UPDATE users SET author_id = NULL WHERE author_id = v_slave;

    -- 6. Delete the slave author
    DELETE FROM authors WHERE id = v_slave;

  END LOOP;

  -- Recalculate master article_count
  UPDATE authors
  SET article_count = (
    SELECT COUNT(*) FROM article_authors WHERE author_id = p_master_id
  )
  WHERE id = p_master_id;

END;
$$;

RESET check_function_bodies;
