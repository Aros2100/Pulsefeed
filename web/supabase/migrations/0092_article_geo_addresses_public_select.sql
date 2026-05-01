-- Migration 0092: Allow authenticated users to SELECT from article_geo_addresses.
-- The table holds public affiliation data from published articles — not sensitive.
-- Write access remains blocked (revoked in 0087).

CREATE POLICY "article_geo_addresses_authenticated_select"
  ON public.article_geo_addresses
  FOR SELECT TO authenticated
  USING (true);

-- Also allow anon for the public article listing page
CREATE POLICY "article_geo_addresses_anon_select"
  ON public.article_geo_addresses
  FOR SELECT TO anon
  USING (true);
