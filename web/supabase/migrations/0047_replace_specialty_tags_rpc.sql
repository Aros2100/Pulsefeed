-- Extend merge_article_specialty_tags trigger to support bypass via session variable.
-- Callers that need to REPLACE (not merge) specialty_tags can set
--   SET LOCAL app.bypass_specialty_merge = 'on';
-- before the UPDATE.  The replace_article_specialty_tags() RPC below does this.

CREATE OR REPLACE FUNCTION merge_article_specialty_tags()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.bypass_specialty_merge', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.specialty_tags := (
    SELECT array_agg(DISTINCT t ORDER BY t)
    FROM unnest(COALESCE(OLD.specialty_tags, '{}') || NEW.specialty_tags) AS t
  );
  RETURN NEW;
END;
$$;

-- RPC: replace specialty_tags on an article, bypassing the merge trigger.
-- Used by lab decisions that remap an article to a different specialty.
CREATE OR REPLACE FUNCTION replace_article_specialty_tags(
  p_article_id UUID,
  p_tags       TEXT[],
  p_verified   BOOLEAN DEFAULT false,
  p_status     TEXT    DEFAULT 'rejected'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SET LOCAL app.bypass_specialty_merge = 'on';
  UPDATE public.articles
  SET specialty_tags = p_tags,
      verified       = p_verified,
      status         = p_status
  WHERE id = p_article_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
