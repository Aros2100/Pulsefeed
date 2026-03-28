-- Add St. Louis aliases that were previously only in the in-memory CITY_ALIASES map.
INSERT INTO city_aliases (alias, canonical, country) VALUES
  ('St. Louis',   'St. Louis', 'United States'),
  ('Saint Louis', 'St. Louis', 'United States')
ON CONFLICT (alias, country) DO NOTHING;
