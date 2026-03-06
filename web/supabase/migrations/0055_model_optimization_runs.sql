CREATE TABLE model_optimization_runs (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  specialty           TEXT        NOT NULL,
  module              TEXT        NOT NULL,
  base_version        TEXT        NOT NULL,
  base_prompt_text    TEXT,
  total_decisions     INT,
  fp_count            INT,
  fn_count            INT,
  fp_patterns         JSONB,
  fn_patterns         JSONB,
  recommended_changes TEXT,
  improved_prompt     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_optimization_runs_specialty_module
  ON model_optimization_runs (specialty, module, created_at DESC);
