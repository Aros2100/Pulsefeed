-- Tilføj priority-kolonne til article_type_rules
-- Lavere tal = højere prioritet (1 vinder over 10)
ALTER TABLE article_type_rules
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 50;

-- Sæt eksplicitte prioriteter på eksisterende regler
-- Meta-analysis: højest prioritet (klar og utvetydig)
UPDATE article_type_rules SET priority = 10 WHERE article_type = 'Meta-analysis';

-- Review
UPDATE article_type_rules SET priority = 20 WHERE article_type = 'Review';

-- Intervention study
UPDATE article_type_rules SET priority = 30 WHERE article_type = 'Intervention study';

-- Non-interventional study
UPDATE article_type_rules SET priority = 40 WHERE article_type = 'Non-interventional study';

-- Case
UPDATE article_type_rules SET priority = 50 WHERE article_type = 'Case';

-- Guideline
UPDATE article_type_rules SET priority = 60 WHERE article_type = 'Guideline';

-- Letters & Notices: lavest prioritet (tit kombineret med mere specifik type)
UPDATE article_type_rules SET priority = 90 WHERE article_type = 'Letters & Notices';
