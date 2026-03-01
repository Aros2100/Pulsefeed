CREATE TABLE public.training_decisions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id          UUID REFERENCES public.articles(id),
  specialty           TEXT NOT NULL,
  editor_verdict      TEXT CHECK (editor_verdict IN ('relevant', 'not_relevant', 'unsure')),
  ai_verdict          TEXT CHECK (ai_verdict IN ('relevant', 'not_relevant', 'unsure')),
  ai_confidence       FLOAT,
  agreement           BOOLEAN,
  disagreement_reason TEXT,
  decided_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by specialty
CREATE INDEX training_decisions_specialty_idx ON public.training_decisions (specialty);
CREATE INDEX training_decisions_article_id_idx ON public.training_decisions (article_id);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
