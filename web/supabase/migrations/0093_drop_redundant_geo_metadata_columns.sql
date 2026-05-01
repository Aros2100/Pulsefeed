-- Migration 0093: Drop redundant and unused columns from article_geo_metadata
--
-- Columns removed:
--   geo_class             — duplicate of articles.geo_class (routed by articles table)
--   ai_batch_id           — never written, never read
--   class_b_parser_version    — duplicate of parser_version
--   class_b_ai_prompt_version — duplicate of ai_prompt_version
--   class_b_ai_processed_at   — duplicate of ai_processed_at
--   class_b_enrichment_at     — duplicate of enriched_at
--
-- Columns kept:
--   class_b_address_count — unique to Class B (address count per article)
--   All other fields unchanged.

ALTER TABLE article_geo_metadata
  DROP COLUMN IF EXISTS geo_class,
  DROP COLUMN IF EXISTS ai_batch_id,
  DROP COLUMN IF EXISTS class_b_parser_version,
  DROP COLUMN IF EXISTS class_b_ai_prompt_version,
  DROP COLUMN IF EXISTS class_b_ai_processed_at,
  DROP COLUMN IF EXISTS class_b_enrichment_at;
