-- base_prompt_text was defined in the original CREATE TABLE but never used
-- by the application. Remove it to clean up the schema and fix PGRST204 errors.
ALTER TABLE model_optimization_runs
  DROP COLUMN IF EXISTS base_prompt_text;
