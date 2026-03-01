-- Add model_version column to articles to track which prompt version scored each article
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS model_version TEXT;
