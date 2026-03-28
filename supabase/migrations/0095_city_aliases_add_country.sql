-- Add country column to city_aliases and enforce uniqueness on (alias, country).
-- Existing rows (no country) are migrated to country = '' so the constraint can be applied.

ALTER TABLE public.city_aliases
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS city_aliases_alias_country_key
  ON public.city_aliases (alias, country);
