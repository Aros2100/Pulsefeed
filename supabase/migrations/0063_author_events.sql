CREATE TABLE author_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON author_events(author_id, created_at DESC);

ALTER TABLE author_events ENABLE ROW LEVEL SECURITY;

-- Admins (app_metadata.role = 'admin') can read events via browser client
CREATE POLICY "Admins can read author_events"
  ON author_events FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Service role (admin client) bypasses RLS automatically — no insert policy needed
