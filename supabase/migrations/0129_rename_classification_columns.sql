ALTER TABLE articles RENAME COLUMN classification_model_version TO subspecialty_model_version;
ALTER TABLE articles RENAME COLUMN classification_reason TO subspecialty_reason;
ALTER TABLE articles RENAME COLUMN classification_scored_at TO subspecialty_scored_at;
