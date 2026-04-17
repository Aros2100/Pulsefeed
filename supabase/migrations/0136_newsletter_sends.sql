-- Migration already applied via Supabase dashboard (20260412135618_create_newsletter_sends_and_clicks)
-- Reproduced here for local migration history completeness.

CREATE TABLE IF NOT EXISTS public.newsletter_sends (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number  integer     NOT NULL,
  year         integer     NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  opened_at    timestamptz,
  open_token   text        NOT NULL DEFAULT gen_random_uuid()::text
);

ALTER TABLE public.newsletter_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can manage newsletter_sends"
  ON public.newsletter_sends
  FOR ALL
  TO authenticated
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_sends_open_token_idx ON public.newsletter_sends(open_token);
CREATE INDEX IF NOT EXISTS newsletter_sends_user_id_idx ON public.newsletter_sends(user_id);
