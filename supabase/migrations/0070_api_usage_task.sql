ALTER TABLE api_usage ADD COLUMN task text NULL;
CREATE INDEX idx_api_usage_task ON api_usage(task) WHERE task IS NOT NULL;
