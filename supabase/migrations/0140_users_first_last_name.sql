-- Add first_name and last_name columns to users table.
-- The existing name column is kept for V2 backwards compatibility.
-- On every V1 save, name is recomputed as first_name || ' ' || last_name.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- Backfill: split existing name on first space
UPDATE public.users
SET
  first_name = split_part(name, ' ', 1),
  last_name  = NULLIF(trim(substring(name FROM position(' ' IN name) + 1)), '')
WHERE name IS NOT NULL
  AND first_name IS NULL;

-- RLS note: no new table — existing users RLS policies already cover these columns.
-- Verification: confirm no new tables were left without RLS (none created here).
