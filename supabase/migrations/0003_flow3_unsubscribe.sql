-- Add unsubscribe_token to users table for tracking the last issued token
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

-- Audit log for all unsubscribe and re-subscribe events
CREATE TABLE public.unsubscribe_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      TEXT,
  user_agent      TEXT,
  resubscribed_at TIMESTAMPTZ
);

ALTER TABLE public.unsubscribe_log ENABLE ROW LEVEL SECURITY;

-- No permissive policies → all access denied for anon/authenticated roles.
-- service_role bypasses RLS entirely and retains full access.
