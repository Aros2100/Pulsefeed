-- Remove p_verified parameter from replace_article_specialty_tags RPC.
-- The verified column is no longer written to — approval_method replaces it.

CREATE OR REPLACE FUNCTION replace_article_specialty_tags(
  p_article_id UUID,
  p_tags       TEXT[],
  p_status     TEXT    DEFAULT 'rejected'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SET LOCAL app.bypass_specialty_merge = 'on';
  UPDATE public.articles
  SET specialty_tags = p_tags,
      status         = p_status
  WHERE id = p_article_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
