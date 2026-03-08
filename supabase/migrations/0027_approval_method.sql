-- Add approval_method column to track how an article was approved.
-- Runs parallel to verified — does NOT replace it.

ALTER TABLE public.articles
  ADD COLUMN approval_method TEXT
  CHECK (approval_method IN ('journal', 'mesh_auto_tag', 'human'));

-- Backfill existing approved articles
UPDATE public.articles SET approval_method = 'journal'       WHERE circle = 1 AND status = 'approved';
UPDATE public.articles SET approval_method = 'mesh_auto_tag' WHERE auto_tagged_at IS NOT NULL AND status = 'approved';
UPDATE public.articles SET approval_method = 'human'         WHERE verified = true AND status = 'approved' AND circle != 1 AND auto_tagged_at IS NULL;
