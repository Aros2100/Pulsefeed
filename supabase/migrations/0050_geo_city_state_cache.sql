-- Cache for Nominatim city→state lookups
CREATE TABLE IF NOT EXISTS geo_city_state_cache (
  city         TEXT NOT NULL,
  country      TEXT NOT NULL,
  state        TEXT,  -- null = looked up but no result
  looked_up_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (city, country)
);

-- Add state column to authors
ALTER TABLE authors ADD COLUMN IF NOT EXISTS state TEXT;
