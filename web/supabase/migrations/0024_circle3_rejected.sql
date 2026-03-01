-- Allow circle = 3 (rejected via training) in addition to 1 (verified) and 2 (quarantine)
ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS articles_circle_check;

ALTER TABLE public.articles
  ADD CONSTRAINT articles_circle_check CHECK (circle IN (1, 2, 3));
