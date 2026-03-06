ALTER TABLE model_optimization_runs
  ADD COLUMN IF NOT EXISTS refinement_iterations JSONB DEFAULT '[]';
