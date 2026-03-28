-- Add "geo_updated" to the article_events event_type check constraint.
-- The constraint was created with the initial table schema (not tracked in migrations).
-- We drop and recreate it with the expanded set of allowed values.

ALTER TABLE article_events
  DROP CONSTRAINT IF EXISTS article_events_event_type_check;

ALTER TABLE article_events
  ADD CONSTRAINT article_events_event_type_check
  CHECK (event_type IN (
    'imported',
    'enriched',
    'lab_decision',
    'feedback',
    'status_changed',
    'verified',
    'author_linked',
    'quality_check',
    'auto_tagged',
    'geo_updated'
  ));
