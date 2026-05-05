-- Expand article_events.event_type CHECK constraint to accept all 35 event types.
-- 27 active events + 8 deprecated (kept so historical rows remain valid).

ALTER TABLE public.article_events
  DROP CONSTRAINT IF EXISTS article_events_event_type_check;

ALTER TABLE public.article_events
  ADD CONSTRAINT article_events_event_type_check CHECK (event_type IN (
    -- Pipeline ingestion & sync
    'imported', 'pubmed_synced',
    'author_linked', 'authors_updated', 'geo_updated',
    'citation_count_updated', 'impact_factor_updated', 'fwci_updated',
    -- Tagging
    'auto_tagged',
    -- AI scoring (batch)
    'specialty_scored', 'subspecialty_scored', 'article_type_scored',
    'condensation_text_scored', 'condensation_sari_scored',
    'geo_class_a_scored', 'geo_class_b_scored',
    -- Human validation (lab)
    'specialty_validated', 'subspecialty_validated', 'article_type_validated',
    'condensation_text_validated', 'condensation_sari_validated',
    'geo_class_a_validated', 'geo_class_b_validated',
    -- Manual edits
    'field_edited',
    -- Newsletter lifecycle
    'newsletter_selected', 'newsletter_sent',
    -- Lifecycle
    'retracted',
    -- Deprecated — kept for historical rows, no new events should use these
    'enriched', 'lab_decision', 'feedback', 'status_changed',
    'verified', 'quality_check', 'condensation_validated', 'condensation_scored'
  ));
