-- subspecialties: canonical list of subspecialties per specialty
-- Replaces the hardcoded SUBSPECIALTY_OPTIONS constant in classification-options.ts

CREATE TABLE public.subspecialties (
  id         SERIAL      PRIMARY KEY,
  specialty  TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INT         NOT NULL DEFAULT 0,
  UNIQUE (specialty, name)
);

ALTER TABLE public.subspecialties ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (needed for client-side pages)
CREATE POLICY "Anyone can read subspecialties"
  ON public.subspecialties FOR SELECT USING (true);

-- Seed: neurosurgery
INSERT INTO public.subspecialties (specialty, name, sort_order) VALUES
  ('neurosurgery', 'Spine surgery',                              1),
  ('neurosurgery', 'Neurosurgical oncology and Radiosurgery',    2),
  ('neurosurgery', 'Vascular and Endovascular Neurosurgery',     3),
  ('neurosurgery', 'Functional Pain and Epilepsy Surgery',       4),
  ('neurosurgery', 'Pediatric and foetal neurosurgery',          5),
  ('neurosurgery', 'Neurotraumatology',                          6),
  ('neurosurgery', 'Peripheral nerve surgery',                   7),
  ('neurosurgery', 'Skull base and pituitary surgery',           8),
  ('neurosurgery', 'Craniofacial and reconstruction surgery',    9),
  ('neurosurgery', 'Geriatric Neurosurgery',                    10),
  ('neurosurgery', 'Hydrocephalus and CSF Disorders',           11),
  ('neurosurgery', 'Neurointensive care and Neuroinfection',    12),
  ('neurosurgery', 'Neurorehabilitation',                       13);
