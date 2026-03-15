-- Merge duplicate authors into a single master record.
-- All article_author rows that point to a slave are re-pointed to the master.
-- ORCID and openalex_id are copied to master if master lacks them.
-- Slave author rows are deleted after re-pointing.
CREATE OR REPLACE FUNCTION merge_authors(
  p_master_id  uuid,
  p_slave_ids  uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_slave uuid;
  v_orcid        text;
  v_openalex_id  text;
BEGIN
  -- Validate
  IF p_master_id IS NULL OR array_length(p_slave_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'merge_authors: master_id and at least one slave_id required';
  END IF;

  IF p_master_id = ANY(p_slave_ids) THEN
    RAISE EXCEPTION 'merge_authors: master_id must not appear in slave_ids';
  END IF;

  -- For each slave: pick up identifiers then re-point article_authors
  FOREACH v_slave IN ARRAY p_slave_ids LOOP
    -- Grab any identifiers the slave has that master lacks
    SELECT
      COALESCE(
        (SELECT orcid FROM authors WHERE id = p_master_id AND orcid IS NULL LIMIT 1),
        a.orcid
      ),
      COALESCE(
        (SELECT openalex_id FROM authors WHERE id = p_master_id AND openalex_id IS NULL LIMIT 1),
        a.openalex_id
      )
    INTO v_orcid, v_openalex_id
    FROM authors a
    WHERE a.id = v_slave;

    -- Patch master with missing identifiers
    UPDATE authors
    SET
      orcid       = COALESCE(orcid,       v_orcid),
      openalex_id = COALESCE(openalex_id, v_openalex_id)
    WHERE id = p_master_id;

    -- Re-point article_authors: skip rows that would create a duplicate
    UPDATE article_authors
    SET author_id = p_master_id
    WHERE author_id = v_slave
      AND NOT EXISTS (
        SELECT 1 FROM article_authors aa2
        WHERE aa2.article_id = article_authors.article_id
          AND aa2.author_id  = p_master_id
      );

    -- Delete any remaining slave rows (duplicates that couldn't be re-pointed)
    DELETE FROM article_authors WHERE author_id = v_slave;

    -- Delete the slave author
    DELETE FROM authors WHERE id = v_slave;
  END LOOP;

  -- Recalculate master article_count
  UPDATE authors
  SET article_count = (
    SELECT COUNT(*) FROM article_authors WHERE author_id = p_master_id
  )
  WHERE id = p_master_id;
END;
$fn$;
