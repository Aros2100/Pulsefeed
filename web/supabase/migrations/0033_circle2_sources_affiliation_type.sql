-- Add 'affiliation' to the circle_2_sources type check constraint
ALTER TABLE circle_2_sources DROP CONSTRAINT circle_2_sources_type_check;

ALTER TABLE circle_2_sources
  ADD CONSTRAINT circle_2_sources_type_check
  CHECK (type IN ('mesh', 'text', 'author', 'institution', 'citation', 'doi', 'keyword', 'affiliation'));
