-- article_number now stores MedlinePgn (pagination/article number field), not PII.
-- Clear any previously imported PII values so the column is clean for re-import.
UPDATE public.articles SET article_number = NULL;
