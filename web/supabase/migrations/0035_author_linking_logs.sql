CREATE TABLE author_linking_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  status           text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  articles_processed int NOT NULL DEFAULT 0,
  authors_linked   int NOT NULL DEFAULT 0,
  errors           jsonb NOT NULL DEFAULT '[]'
);
