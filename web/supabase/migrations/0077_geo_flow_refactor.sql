-- Geo-flow refactor: rename columns, drop legacy columns and table

-- 1. Rename location_parsed_at → geo_defined_at
ALTER TABLE articles RENAME COLUMN location_parsed_at TO geo_defined_at;

-- 2. Rename location_confidence → geo_parser_confidence
ALTER TABLE articles RENAME COLUMN location_confidence TO geo_parser_confidence;

-- 3. Drop articles.country (legacy C3-only column)
ALTER TABLE articles DROP COLUMN IF EXISTS country;

-- 4. Drop circle_3_sources table (C3 import pipeline removed)
DROP TABLE IF EXISTS circle_3_sources CASCADE;
