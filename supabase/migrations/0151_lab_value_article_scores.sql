-- Stores AI scores produced by running a lab_value_prompt version on a
-- lab_value_articles row. One row per (prompt_id, article_id).
--
-- score is nullable: a NULL score means the AI response could not be parsed,
-- in which case raw_response holds the full payload for debugging and the
-- article is considered "not scored" for distribution and evaluation.

CREATE TABLE public.lab_value_article_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    uuid NOT NULL REFERENCES public.lab_modules(id)         ON DELETE CASCADE,
  prompt_id    uuid NOT NULL REFERENCES public.lab_value_prompts(id)   ON DELETE CASCADE,
  article_id   uuid NOT NULL REFERENCES public.lab_value_articles(id)  ON DELETE CASCADE,
  score        numeric,
  reasoning    text,
  raw_response jsonb,
  scored_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, article_id)
);

CREATE INDEX lab_value_article_scores_module_idx ON public.lab_value_article_scores(module_id);
CREATE INDEX lab_value_article_scores_prompt_idx ON public.lab_value_article_scores(prompt_id);

-- Server-side only: import pipelines, admin routes via createAdminClient.
-- service_role bypasses RLS, so no policy is required.
ALTER TABLE public.lab_value_article_scores ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lab_value_article_scores FROM anon, authenticated;

-- Verification: must return zero rows.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('lab_value_article_scores')
  AND rowsecurity = false;
