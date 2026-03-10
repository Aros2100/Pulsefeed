-- Seed the initial classification prompt for neurosurgery
INSERT INTO public.model_versions (specialty, module, version, active, prompt_text, notes, generated_by)
VALUES (
  'neurosurgery',
  'classification',
  'v1',
  true,
  E'You are a neurosurgery research classifier. Analyze the following article and classify it on three dimensions.\n\nSpecialty: {{specialty}}\nTitle: {{title}}\nAbstract: {{abstract}}\n\nClassify the article on these three parameters:\n\n1. **subspecialty** — Choose exactly one:\n   Spine, Vascular, Neuro-oncology, Skull Base, Functional, Pediatric, Trauma/Critical Care, Hydrocephalus/CSF, Peripheral Nerve, Stereotactic/Radiosurgery\n\n2. **article_type** — Choose exactly one:\n   RCT, Meta-analysis, Systematic Review, Narrative Review, Prospective Cohort, Retrospective Cohort, Case Series, Case Report, Technical Note, Guideline, Regulatory Update, Editorial/Commentary, Letter\n\n3. **study_design** — Choose exactly one:\n   Randomized controlled, Prospective observational, Retrospective observational, Cross-sectional, Case-control, Systematic review, Meta-analysis, In vitro/preclinical, Registry-based, Qualitative, Not applicable\n\nRespond with ONLY a JSON object (no markdown, no explanation outside the JSON):\n{\n  "subspecialty": "...",\n  "article_type": "...",\n  "study_design": "...",\n  "reason": "Brief 1-2 sentence explanation of your classification choices"\n}',
  'Initial classification prompt',
  'manual'
)
ON CONFLICT DO NOTHING;
