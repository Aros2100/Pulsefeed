-- Function: recalculate article_count for a single author
CREATE OR REPLACE FUNCTION public.sync_author_article_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_author_id uuid;
BEGIN
  -- On DELETE the old row is in OLD; on INSERT/UPDATE the new row is in NEW
  IF TG_OP = 'DELETE' THEN
    target_author_id := OLD.author_id;
  ELSE
    target_author_id := NEW.author_id;
  END IF;

  UPDATE public.authors
  SET article_count = (
    SELECT COUNT(*) FROM public.article_authors
    WHERE author_id = target_author_id
  )
  WHERE id = target_author_id;

  RETURN NULL;
END;
$$;

-- Trigger: fire after any insert, update, or delete on article_authors
CREATE OR REPLACE TRIGGER trg_sync_author_article_count
AFTER INSERT OR UPDATE OF author_id OR DELETE
ON public.article_authors
FOR EACH ROW
EXECUTE FUNCTION public.sync_author_article_count();
