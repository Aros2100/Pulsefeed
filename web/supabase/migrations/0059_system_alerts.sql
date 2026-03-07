-- System alerts table
CREATE TABLE IF NOT EXISTS system_alerts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  message     text        NOT NULL,
  type        text        NOT NULL DEFAULT 'info'
                          CHECK (type IN ('info', 'warning', 'error')),
  active      boolean     NOT NULL DEFAULT true,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. unauthenticated) can read active, non-expired alerts
CREATE POLICY "Public read active alerts"
  ON system_alerts FOR SELECT
  USING (
    active = true
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Only service-role / admin can mutate
CREATE POLICY "Admin full access"
  ON system_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
