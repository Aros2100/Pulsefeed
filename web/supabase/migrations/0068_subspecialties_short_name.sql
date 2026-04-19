ALTER TABLE public.subspecialties ADD COLUMN IF NOT EXISTS short_name text;

UPDATE public.subspecialties
SET short_name = CASE name
  WHEN 'Spine surgery'                              THEN 'Spine'
  WHEN 'Neurosurgical oncology and Radiosurgery'    THEN 'Oncology & Radiosurgery'
  WHEN 'Vascular and Endovascular Neurosurgery'     THEN 'Vascular'
  WHEN 'Functional Pain and Epilepsy Surgery'       THEN 'Functional & Pain'
  WHEN 'Pediatric and foetal neurosurgery'          THEN 'Pediatric'
  WHEN 'Neurotraumatology'                          THEN 'Trauma'
  WHEN 'Peripheral nerve surgery'                   THEN 'Peripheral nerve'
  WHEN 'Skull base and pituitary surgery'           THEN 'Skull base'
  WHEN 'Craniofacial and reconstruction surgery'    THEN 'Craniofacial'
  WHEN 'Geriatric Neurosurgery'                     THEN 'Geriatric'
  WHEN 'Hydrocephalus and CSF Disorders'            THEN 'Hydrocephalus & CSF'
  WHEN 'Neurointensive care and Neuroinfection'     THEN 'Neuro-ICU & Infection'
  WHEN 'Neurorehabilitation'                        THEN 'Neurorehabilitation'
  ELSE name
END
WHERE specialty = 'neurosurgery';
