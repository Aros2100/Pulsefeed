-- Allow bulk/system geo_updated events without a specific author_id.
ALTER TABLE author_events
  ALTER COLUMN author_id DROP NOT NULL;
