-- Tracks when a prompt version had its quick test run (15 articles selected
-- from the Bradley-Terry top/middle/bottom). Distinguishes quick-test-only
-- from "Advanced: score all" partial states for the status badge.

ALTER TABLE public.lab_value_prompts
  ADD COLUMN quick_tested_at timestamptz;
