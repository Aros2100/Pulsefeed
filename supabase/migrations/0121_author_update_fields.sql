-- articles: store authors snapshot before update-authors overwrites it
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS authors_raw_previous jsonb;

-- authors: allow manual geo locking so update-authors skips geo fields
ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS geo_locked_by text
    CHECK (geo_locked_by IN ('human', 'user', 'system'));
