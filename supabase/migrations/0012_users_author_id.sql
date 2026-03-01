ALTER TABLE public.users
  ADD COLUMN author_id UUID REFERENCES public.authors(id);
