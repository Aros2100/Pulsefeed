-- Clear specialty_tags for Circle 2 articles that haven't been verified yet.
-- These articles should be in quarantine with no specialty assignment
-- until approved via training.
UPDATE public.articles
SET specialty_tags = '{}'
WHERE circle = 2
  AND verified = false;

NOTIFY pgrst, 'reload schema';
