-- Circle 1 articles are from trusted sources and require no manual verification.
-- Set verified = true for all existing and future Circle 1 articles so that
-- .eq("verified", true) can be used universally to exclude unverified Circle 2 content.
UPDATE public.articles
  SET verified = true
  WHERE circle = 1;
