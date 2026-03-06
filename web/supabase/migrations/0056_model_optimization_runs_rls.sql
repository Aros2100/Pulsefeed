-- Enable RLS and grant service-role (admin client) full access.
-- The admin client bypasses RLS by design, but this policy ensures
-- authenticated admin users can also read runs directly if needed.

ALTER TABLE model_optimization_runs ENABLE ROW LEVEL SECURITY;

-- Service role always bypasses RLS in Supabase — this policy is for
-- completeness and documents that only service-role writes are intended.
CREATE POLICY "service role full access"
  ON model_optimization_runs
  USING (true)
  WITH CHECK (true);
