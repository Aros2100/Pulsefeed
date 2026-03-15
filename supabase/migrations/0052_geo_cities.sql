-- GeoNames cities with population >= 1000
CREATE TABLE geo_cities (
  geonameid int PRIMARY KEY,
  name text NOT NULL,
  ascii_name text,
  country_code char(2) NOT NULL,
  country text,
  admin1_code text,
  state text,
  population int DEFAULT 0,
  latitude numeric,
  longitude numeric
);

CREATE INDEX idx_geo_cities_name_country ON geo_cities(lower(name), country_code);
CREATE INDEX idx_geo_cities_country ON geo_cities(country_code);
