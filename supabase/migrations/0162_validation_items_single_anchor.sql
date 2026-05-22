-- Single-anchor validation: new columns for single-comparison validation flow.
-- Replaces the old 2-anchor (anchor_low_id / anchor_high_id) workflow for new runs.

ALTER TABLE public.lab_value_validation_items
  ADD COLUMN anchor_id   uuid REFERENCES public.lab_value_articles(id),
  ADD COLUMN anchor_side text,   -- 'lower' | 'upper'
  ADD COLUMN choice      text;   -- 'new' | 'anchor'

-- Clean up permanently stuck unscored items from old runs that never got scored
-- and have no anchors assigned. These block pool stats.
DELETE FROM public.lab_value_validation_items
WHERE craft_score IS NULL
  AND scored_at IS NULL
  AND anchor_id IS NULL
  AND anchor_low_id IS NULL
  AND anchor_high_id IS NULL;
