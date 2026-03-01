-- user_keywords: stores per-user keyword preferences for article matching
CREATE TABLE public.user_keywords (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  keyword    TEXT        NOT NULL CHECK (char_length(keyword) BETWEEN 1 AND 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, keyword)
);

ALTER TABLE public.user_keywords ENABLE ROW LEVEL SECURITY;

-- Each user can read their own keywords
CREATE POLICY "keywords: own select" ON public.user_keywords
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Each user can insert their own keywords
CREATE POLICY "keywords: own insert" ON public.user_keywords
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Each user can delete their own keywords
CREATE POLICY "keywords: own delete" ON public.user_keywords
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all keywords (uses app_metadata to avoid recursive RLS)
CREATE POLICY "keywords: admin select all" ON public.user_keywords
  FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
