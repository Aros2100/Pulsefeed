-- Fix merge_article_specialty_tags trigger: array_agg returns NULL when both
-- OLD and NEW specialty_tags are empty arrays, violating the NOT NULL constraint.
-- Wrap the result in COALESCE(..., '{}') so empty input → empty array, not NULL.

CREATE OR REPLACE FUNCTION merge_article_specialty_tags()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.specialty_tags := COALESCE(
    (SELECT array_agg(DISTINCT t ORDER BY t)
     FROM unnest(COALESCE(OLD.specialty_tags, '{}') || COALESCE(NEW.specialty_tags, '{}')) AS t),
    '{}'
  );
  RETURN NEW;
END;
$$;
