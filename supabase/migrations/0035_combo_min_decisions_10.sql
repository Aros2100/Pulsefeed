-- Lower min_decisions default to 10 and update existing rows
ALTER TABLE public.tagging_rule_combos ALTER COLUMN min_decisions SET DEFAULT 10;
UPDATE public.tagging_rule_combos SET min_decisions = 10 WHERE min_decisions != 10;
