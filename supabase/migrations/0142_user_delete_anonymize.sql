-- Add deleted_at timestamp to mark anonymized user rows.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Anonymize a user: clear personal data, delete associated rows, preserve audit trail.
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Hard-delete personal data
  DELETE FROM public.author_follows     WHERE user_id = p_user_id;
  DELETE FROM public.author_dismissals  WHERE user_id = p_user_id;
  DELETE FROM public.notifications      WHERE user_id = p_user_id;
  DELETE FROM public.reading_history    WHERE user_id = p_user_id;
  DELETE FROM public.saved_articles     WHERE user_id = p_user_id;
  DELETE FROM public.user_keywords      WHERE user_id = p_user_id;
  DELETE FROM public.lab_sessions       WHERE user_id = p_user_id;
  DELETE FROM public.projects           WHERE user_id = p_user_id;
  DELETE FROM public.unsubscribe_log    WHERE user_id = p_user_id;
  DELETE FROM public.newsletter_sends   WHERE user_id = p_user_id;

  -- Anonymize the users row (audit references intentionally kept)
  UPDATE public.users
  SET
    first_name          = NULL,
    last_name           = NULL,
    name                = NULL,
    email               = NULL,
    title               = NULL,
    subspecialties      = ARRAY[]::text[],
    specialty_slugs     = ARRAY[]::text[],
    avatar_url          = NULL,
    is_public           = false,
    email_notifications = false,
    role_type           = NULL,
    country             = NULL,
    city                = NULL,
    state               = NULL,
    hospital            = NULL,
    department          = NULL,
    author_id           = NULL,
    deleted_at          = now()
  WHERE id = p_user_id;
END;
$$;

-- Grant execute to service_role only (called from server route via admin client).
REVOKE EXECUTE ON FUNCTION public.anonymize_user(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.anonymize_user(uuid) TO service_role;
