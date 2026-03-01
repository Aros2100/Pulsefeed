CREATE TABLE api_usage (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_key         TEXT NOT NULL,
  prompt_tokens     INT NOT NULL,
  completion_tokens INT NOT NULL,
  total_tokens      INT NOT NULL,
  cost_usd          DECIMAL(10,6),
  called_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_model_key ON api_usage(model_key);
CREATE INDEX idx_api_usage_called_at ON api_usage(called_at DESC);
