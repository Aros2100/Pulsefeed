-- ── Articles: add sync tracking columns ──────────────────────────────────────
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS pubmed_synced_at  timestamptz,
  ADD COLUMN IF NOT EXISTS authors_changed   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authors_raw_new   jsonb,
  ADD COLUMN IF NOT EXISTS retracted         boolean NOT NULL DEFAULT false;

-- ── pubmed_sync_log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pubmed_sync_log (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pubmed_id          text        NOT NULL,
  event              text        NOT NULL CHECK (event IN ('updated', 'imported', 'retracted')),
  fields_changed     text[],
  pubmed_modified_at date,
  synced_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pubmed_sync_log_pubmed_id_idx ON pubmed_sync_log (pubmed_id);
CREATE INDEX IF NOT EXISTS pubmed_sync_log_synced_at_idx ON pubmed_sync_log (synced_at DESC);
CREATE INDEX IF NOT EXISTS pubmed_sync_log_event_idx     ON pubmed_sync_log (event);
