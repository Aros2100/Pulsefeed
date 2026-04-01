-- Ryd gamle regler
DELETE FROM article_type_rules;

-- Meta-analysis
INSERT INTO article_type_rules (publication_type, article_type, is_active) VALUES
  ('Meta-Analysis', 'Meta-analysis', true),
  ('Network Meta-Analysis', 'Meta-analysis', true);

-- Review
INSERT INTO article_type_rules (publication_type, article_type, is_active) VALUES
  ('Systematic Review', 'Review', true),
  ('Scoping Review', 'Review', true),
  ('Review', 'Review', true);

-- Intervention study
INSERT INTO article_type_rules (publication_type, article_type, is_active) VALUES
  ('Randomized Controlled Trial', 'Intervention study', true),
  ('Clinical Trial', 'Intervention study', true),
  ('Clinical Trial, Phase I', 'Intervention study', true),
  ('Clinical Trial, Phase II', 'Intervention study', true),
  ('Clinical Trial, Phase III', 'Intervention study', true),
  ('Clinical Trial, Phase IV', 'Intervention study', true),
  ('Controlled Clinical Trial', 'Intervention study', true),
  ('Pragmatic Clinical Trial', 'Intervention study', true),
  ('Equivalence Trial', 'Intervention study', true),
  ('Clinical Trial Protocol', 'Intervention study', true);

-- Non-interventional study
INSERT INTO article_type_rules (publication_type, article_type, is_active) VALUES
  ('Observational Study', 'Non-interventional study', true),
  ('Multicenter Study', 'Non-interventional study', true),
  ('Comparative Study', 'Non-interventional study', true),
  ('Validation Study', 'Non-interventional study', true),
  ('Clinical Study', 'Non-interventional study', true);

-- Case
INSERT INTO article_type_rules (publication_type, article_type, is_active) VALUES
  ('Case Reports', 'Case', true),
  ('Twin Study', 'Case', true);

-- Guideline
INSERT INTO article_type_rules (publication_type, article_type, is_active) VALUES
  ('Practice Guideline', 'Guideline', true),
  ('Consensus Statement', 'Guideline', true),
  ('Guideline', 'Guideline', true);

-- Letters & Notices
INSERT INTO article_type_rules (publication_type, article_type, is_active) VALUES
  ('Letter', 'Letters & Notices', true),
  ('Editorial', 'Letters & Notices', true),
  ('Comment', 'Letters & Notices', true),
  ('Published Erratum', 'Letters & Notices', true),
  ('Retraction Notice', 'Letters & Notices', true),
  ('Retracted Publication', 'Letters & Notices', true),
  ('Expression of Concern', 'Letters & Notices', true),
  ('News', 'Letters & Notices', true),
  ('Biography', 'Letters & Notices', true),
  ('Portrait', 'Letters & Notices', true),
  ('Historical Article', 'Letters & Notices', true),
  ('Conference Proceedings', 'Letters & Notices', true),
  ('Introductory Journal Article', 'Letters & Notices', true),
  ('Preprint', 'Letters & Notices', true),
  ('Video-Audio Media', 'Letters & Notices', true),
  ('Dataset', 'Letters & Notices', true),
  ('Technical Report', 'Letters & Notices', true);

-- Opdater AI-prompt til v2 med 10 kategorier
UPDATE public.model_versions
SET
  prompt_text = E'Du klassificerer en videnskabelig artikel inden for neurokirurgi i præcist én af følgende 10 kategorier:\n\n1. Meta-analysis — Statistisk syntese der pooler resultater fra multiple primærstudier. Altid baseret på eksplicit søgestrategi og kvantitativ kombination af data.\n\n2. Review — Gennemgang af litteraturen — systematisk (eksplicit søgestrategi) eller narrativ (ekspertbaseret). Opsummerer eksisterende viden uden nye primærdata.\n\n3. Intervention study — Primærstudie hvor forskerne aktivt intervenerer — RCT, kliniske forsøg i alle faser, kontrollerede forsøg på mennesker.\n\n4. Non-interventional study — Observationelt primærstudie med patientdata uden aktiv intervention — retrospektivt, prospektivt, kohort, tværsnit, case-control, registeranalyse.\n\n5. Basic study — Grundvidenskabelig forskning uden direkte patientdata — dyreeksperimentelle studier, in vitro, in silico, ex vivo vævsanalyse.\n\n6. Case — Beskrivelse af én eller meget få patienter med fokus på noget usædvanligt — sjælden diagnose, atypisk forløb, uventet komplikation.\n\n7. Guideline — Kliniske anbefalinger fra faglige selskaber eller ekspertpaneler — practice guidelines, consensus statements, position papers.\n\n8. Technique & Technology — Beskrivelse af ny eller modificeret kirurgisk teknik, instrument, protokol eller teknologisk løsning. Fokus på hvordan, ikke effekt.\n\n9. Administration — Artikler om etik, uddannelse, økonomi, organisation, kvalitetssikring og sundhedspolitik i neurokirurgi.\n\n10. Letters & Notices — Letters, editorials, kommentarer, errata, retractions, nyheder, biografier. Ingen original data.\n\nReturner dit svar som valid JSON kun, uden præambel eller markdown:\n{\n  "article_type": "<præcist ét kategorinavn fra listen ovenfor>",\n  "confidence": <heltal 1-99>,\n  "rationale": "<én sætning der forklarer klassifikationen>"\n}\n\nConfidence scale:\n- 90-99: Utvetydig. Artikeltypen er eksplicit angivet eller umiskendeligt klar fra titel og abstract.\n- 70-89: Høj sikkerhed. Stærke signaler understøtter klassifikationen med minimal tvetydighed.\n- 50-69: Moderat sikkerhed. Klassifikationen er sandsynlig men et eller flere elementer skaber usikkerhed.\n- 30-49: Lav sikkerhed. Artiklen passer plausibelt i flere kategorier.\n- 1-29: Meget usikker. Utilstrækkelig information eller meget tvetydig artikel.\n\nBrug hele confidence-spektret. Defaulter ikke til høj confidence på åbenlyse nøgleordsmatch alene.\n\nKlassificér følgende artikel:\n\nTitle: {{title}}\nJournal: {{journal}}\nAbstract: {{abstract}}\nMeSH Terms: {{mesh_terms}}\nPublication Types: {{publication_types}}',
  version      = 'v2',
  notes        = '10 kategorier: Meta-analysis, Review, Intervention study, Non-interventional study, Basic study, Case, Guideline, Technique & Technology, Administration, Letters & Notices'
WHERE specialty = 'neurosurgery'
  AND module    = 'article_type'
  AND active    = true;
