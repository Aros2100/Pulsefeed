CREATE TABLE public.authors (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name     TEXT NOT NULL,
  orcid            TEXT UNIQUE,
  openalex_id      TEXT UNIQUE,
  affiliations     TEXT[] DEFAULT '{}',
  match_confidence FLOAT DEFAULT 1.0,
  article_count    INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Link table between articles and authors
CREATE TABLE public.article_authors (
  article_id       UUID REFERENCES public.articles(id) ON DELETE CASCADE,
  author_id        UUID REFERENCES public.authors(id) ON DELETE CASCADE,
  position         INT,  -- author order (1 = first author)
  is_corresponding BOOLEAN DEFAULT FALSE,
  orcid_on_paper   TEXT,  -- ORCID as it appeared on this specific paper
  PRIMARY KEY (article_id, author_id)
);

CREATE INDEX idx_article_authors_author_id ON public.article_authors(author_id);
CREATE INDEX idx_authors_orcid ON public.authors(orcid);
CREATE INDEX idx_authors_openalex ON public.authors(openalex_id);
