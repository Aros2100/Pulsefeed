import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_V4 = `You are a medical literature classifier for a neurosurgical research platform. Classify the article into exactly one of the following 12 article types.

ARTICLE TYPES:
Meta-analysis — Statistical synthesis pooling results from multiple primary studies. Always based on an explicit search strategy and quantitative data combination (e.g. forest plots, pooled effect sizes). Includes network meta-analysis. Never a primary study itself.

Review — Structured overview of existing literature. Includes systematic reviews (explicit search strategy, inclusion criteria, reproducible) and narrative reviews (expert-based, selective). Summarises existing knowledge without generating new primary data.

Intervention study — Primary study where researchers actively intervene. Includes RCTs, clinical trials (all phases), controlled trials, and pragmatic trials on humans. Randomisation eliminates systematic bias — RCT is the gold standard for causal inference.

Non-interventional study — Observational primary study with patient data and no active intervention. Includes retrospective, prospective, cohort, cross-sectional, case-control, and registry studies. Can show association but cannot prove causation. For human studies: must have n≥10 patients otherwise categorize as case.

Basic study — Primary research without direct patient data. Includes animal studies, in vitro, in silico, ex vivo tissue analysis, and computational models. Results may be translational but cannot be directly applied to clinical practice. Includes surgical technique development in animal models.

Case — Description of one or very few patients focusing on something unusual — rare diagnosis, atypical course, unexpected complication, or novel treatment approach. Includes case series. Generates hypotheses but proves nothing.

Guideline — Clinical recommendations from professional societies or expert panels based on systematic evidence review and consensus. Includes practice guidelines, consensus statements, and position papers. Not a study — a recommendation for clinical action.

Surgical Technique — Description of a new or modified surgical technique, instrument, protocol, or classification system for human surgery. Focus is on HOW something is done — not on proving efficacy through comparison. Includes step-by-step operative descriptions, modified approaches, and new instruments designed for surgical use. Must involve human surgical procedures only.

Tech — Digital solutions, AI tools, robotics, software, and technological platforms for clinical use. Focus is on WHAT IS BUILT — not the surgical execution itself. Includes machine learning models, computer-assisted surgery platforms, and digital health tools.

Administration — Articles about the organisational framework of neurosurgery: ethics, education, training, economics, health policy, quality improvement, workforce, and healthcare management. Neither primary research nor clinical recommendations.

Letters & Notices — Non-primary literature of communicative or administrative character: letters to the editor, editorials, comments, errata, retractions, expressions of concern, news items, biographies, historical articles, conference proceedings. Typically contains no original data.

Unclassified — Use when the article cannot be reliably assigned to any of the 11 categories above. This applies in two situations: (1) the article genuinely does not fit any category based on its content, or (2) the available information is insufficient to make a determination — for example when the abstract is missing and the title alone does not indicate the article type. Do not use this category simply because the article is difficult or borderline — if a reasonable classification can be made, it must be made.

CLASSIFICATION RULES:
Use publication_types as a supporting signal — it may contain unknown or ambiguous types that provide useful context.
If the article genuinely does not fit any category, or information is insufficient → Unclassified

INPUT SIGNAL GUIDANCE:
If the title explicitly states a study design term (e.g. "systematic review", "meta-analysis", "randomized controlled trial", "case report", "case series"), treat this as a definitive signal that overrides the article's subject matter. Do not let topic pull the classification away from an explicit design term in the title.
Title and abstract are the primary signals — study design, methods, and conclusions are usually explicit here. Always establish your classification from these first.
MeSH Terms: use only MeSH terms that indicate study design (e.g. "Randomized Controlled Trial", "Retrospective Studies", "Meta-Analysis") — ignore topic-descriptive MeSH terms.
Publication Types: use as supporting signal for edge cases.

CRITICAL EDGE CASES:
A preprint → Unclassified.
A "Technical Note" publication type → Surgical Technique if human surgery; Basic study if animal model.
A surgical technique article is classified by primary focus: if the main contribution is the technique itself → Surgical Technique (human only) or Basic study (animal); if outcomes are the main finding → apply sample size rule for human studies (n<10 → Case; n≥10 → Non-interventional study).
A retrospective study on outcomes of a surgical technique → apply sample size rule: Non-interventional study if n≥10, Case if n<10, NOT Surgical Technique.
An animal study on a neurosurgical topic → Basic study, even if clinically framed.
Any surgical technique development or testing in animal models → Basic study, NOT Surgical Technique.
A letter commenting on another article → Letters & Notices, even if it contains new data.
A consensus statement from a professional society → Guideline, even if framed as a review.
A registry analysis or national database study → Non-interventional study (if n≥10).
An AI/machine learning study → Tech.
A robotics or computer-assisted surgery platform → Tech, not Surgical Technique.
A new surgical instrument or implant design without digital/software component → Surgical Technique if human surgery, Basic study if animal testing.
When uncertain between Review and Meta-analysis: if quantitative pooling is present → Meta-analysis; otherwise → Review.
When uncertain between Surgical Technique and Tech: if the core contribution is a digital/software/AI/robotic system → Tech; if it is a manual operative method or physical instrument for human surgery → Surgical Technique.
The n≥10 / n<10 rule for human studies is absolute. A human study with n≥10 must be classified as a non-interventional study or an Intervention study if active intervention is present. A prospective study with n=18 is never a Case.

WHEN UNCERTAIN — APPLY THIS PRIORITY ORDER:
If the article could plausibly fit multiple categories, prefer the higher-ranked type:
Meta-analysis > Review
Intervention study > Non-interventional study > Basic study
Surgical Technique > Tech (if manual/physical for humans); Tech > Surgical Technique (if digital/software)
Any primary study > Case (but remember: human studies with n<10 must be Case regardless)
Any of the above > Administration > Letters & Notices
Unclassified only if no category can be reasonably assigned

INPUT:
Title: {{title}}
Journal: {{journal}}
Abstract: {{abstract}}
MeSH Terms: {{mesh_terms}}
Publication Types: {{publication_types}}

CONFIDENCE SCALE:
90-99: Unambiguous. Publication type or explicit statement makes the type unmistakable.
70-89: High confidence. Strong signals with minimal ambiguity.
50-69: Moderate confidence. Classification is likely but one or more elements create uncertainty.
30-49: Low confidence. Article could plausibly fit multiple categories.
1-29: Very uncertain. Insufficient information — likely Unclassified.

Use the full confidence spectrum. Do not cluster around round numbers. Do not default to high confidence on keyword matches alone. A correct classification with low confidence is better than an incorrect one with high confidence.

Respond with ONLY valid JSON — no preamble, no markdown:
{
  "article_type": "<exactly one type name from the list above>",
  "confidence": <integer 1-99>,
  "rationale": "<one sentence explaining the classification>"
}`;

function parsePgArray(s: string): string[] {
  // PostgreSQL array literal: {"Journal Article",Review} or {val1,val2}
  return s.replace(/^\{/, "").replace(/\}$/, "").split(",").map((v) => v.replace(/^"|"$/g, "").trim()).filter(Boolean);
}

function parseMeshTerms(s: string): string {
  try {
    const arr = JSON.parse(s) as Array<{ descriptor: string }>;
    return arr.map((t) => t.descriptor).join(", ") || "None";
  } catch {
    return "None";
  }
}

const ARTICLES = [
  {
    id: "caad6587-b090-4890-8c6b-f8113821d2ad",
    title: "Coccydynia-The Efficacy of Available Treatment Options: A Systematic Review.",
    journal_abbr: "Global Spine J",
    abstract: `STUDY DESIGN: Systematic Review.

OBJECTIVE: To evaluate the efficacy of available treatment options for patients with persistent coccydynia through a systematic review.

METHODS: Original peer-reviewed publications on treatment for coccydynia were identified using Preferred Reporting Items for Systematic Reviews and Meta-Analysis (PRISMA) guidelines by performing a literature search of relevant databases, from their inception to January 17, 2020, combined with other sources. Data on extracted treatment outcome was pooled based on treatment categories to allow for meta-analysis. All outcomes relevant to the treatment efficacy of coccydynia were extracted. No single measure of outcome was consistently present among the included studies. Numeric Rating Scale, (NRS, 0-10) for pain was used as the primary outcome measure. Studies with treatment outcome on adult patients with chronic primary coccydynia were considered eligible.

RESULTS: A total of 1980 patients across 64 studies were identified: five randomized controlled trials, one experimental study, one quasi-experimental study, 11 prospective observational studies, 45 retrospective studies and unpublished data from the DaneSpine registry. The greatest improvement in pain was achieved by patients who underwent radiofrequency therapy (RFT, mean Visual Analog Scale (VAS) decreased by 5.11 cm). A similar mean improvement was achieved from Extracorporeal Shockwave Therapy (ESWT, 5.06), Coccygectomy (4.86) and Injection (4.22). Although improved, the mean change was less for those who received Ganglion block (2.98), Stretching/Manipulation (2.19) and Conservative/Usual Care (1.69).

CONCLUSION: This study highlights the progressive nature of treatment for coccydynia, starting with noninvasive methods before considering coccygectomy. Non-surgical management provides pain relief for many patients. Coccygectomy is by far the most thoroughly investigated treatment option and may be beneficial for refractory cases. Future randomized controlled trials should be conducted with an aim to compare the efficacy of interventional therapies amongst each other and to coccygectomy.`,
    mesh_terms: "[]",
    publication_types: `{"Journal Article"}`,
  },
  {
    id: "139c85c5-ee03-461d-820f-81504c4d96fe",
    title: "Surgical management and postoperative outcomes of orbital cavernous malformations: A systematic literature review by the EANS skull base section.",
    journal_abbr: "Brain Spine",
    abstract: `INTRODUCTION: Orbital cavernous malformations (OCMs) are benign vascular lesions frequently associated with progressive proptosis and visual disturbances due to their slow growth and compression of adjacent structures. Multiple surgical approaches have been developed for their treatment, including microsurgical transfacial-transorbital approaches (MTTAs), cranio-orbital approaches (MCOAs), orbitotomies (MOs), endoscopic endonasal approaches (EEAs), and endoscopic transorbital approaches (ETOAs). However, the optimal approach remains a topic of debate.

RESEARCH OBJECTIVE: This systematic review aims to compare the resection rates, postoperative complications, and clinical outcomes across various surgical approaches for OCM management.

METHODS: A comprehensive literature search was performed in PubMed, Embase, and the Cochrane Library according to PRISMA guidelines. Studies reporting surgical treatment of OCMs with clinical outcome data were included. Study quality was assessed using the Newcastle-Ottawa Scale. Statistical analyses were conducted using chi-square and Mann-Whitney U tests.

RESULTS AND CONCLUSIONS: Of 239 screened studies, 94 met inclusion criteria, comprising 1007 patients (mean age 43.9 years; 58.5 % female). Proptosis (63.2 %) and visual impairment (48.1 %) were the most common symptoms. Most lesions were intraconal (80 %) and laterally positioned (42.8 %). EEAs were the most commonly used approach (40.1 %), followed by MOs (25.7 %) and MTTAs (21.6 %). Gross total resection was achieved in 93.7 % of cases. Complications were infrequent: visual acuity worsening (3.9 %), diplopia (2.4 %), and enophthalmos (1.7 %). Functional outcomes improved significantly, particularly visual acuity (65.1 %) and proptosis (61.6 %). EEAs provide high resection rates with minimal morbidity, especially for medial OCMs. ETOAs represent a promising, minimally invasive option for laterally located lesions.`,
    mesh_terms: "[]",
    publication_types: `{"Journal Article",Review}`,
  },
  {
    id: "d1b8203e-21b7-47c4-8cae-ac02395681d8",
    title: "Validated Microsurgical Training Programmes: A Systematic Review of the Current Literature.",
    journal_abbr: "J Clin Med",
    abstract: `Microsurgical skill acquisition and development are complex processes, due to the often complex learning curve, limited training possibilities, and growing restrictions on working hours. Simulation-based training programmes, employing various models, have been proposed. Nevertheless, the extent to which these training programmes are supported by scientific evidence is unclear. The aim of this systematic review is to evaluate the extent and quality of the scientific evidence backing validated microsurgical training programmes.A systematic literature review was conducted, following a study protocol established a priori and in accordance with the PRISMA guidelines. The databases searched were the Web of Science Core Collection (Web of Knowledge), Medline (Ovid), Embase (Embase.com), and ERIC (Ovid). Studies were included if they described microsurgical training programmes and presented a form of validation of training effectiveness. Data extraction included the number of participants, training duration and frequency, validation type, assessment methods, outcomes, study limitations, and a detailed training regimen. The risk of bias and quality were assessed using the Medical Education Research Study Quality Instrument (MERSQI). Validity was assessed using an established validity framework (content, face, construct, and criterion encompassing both concurrent and predictive validity). The Level of Evidence (LoE) and Recommendation (LoR) were evaluated using the Oxford Centre for Evidence-Based Medicine (OCEBM).A total of 25 studies met the inclusion criteria. Training programmes were classified into one-time intensive courses or longitudinal curricula. Face, content, and construct validity were the most commonly assessed aspects, while predictive validity was the least frequently assessed and not properly evaluated. Training models ranged from low-fidelity (silicone tubes, synthetic vessels) to high-fidelity (live animal models). The Global Rating Scale (GRS), the Structured Assessment of Microsurgery Skills (SAMS), and the Objective Structured Assessment of Technical Skills (OSATS) were the most frequently used objective assessment tools for evaluation methods within the programmes. The risk of bias MERSQI score was 12.96, ranging from 10.5 to 15.5, and LoE and LoR scores were moderated. Across the studies, 96% reported significant improvement in microsurgical skills among participants. However, most studies were limited by small sample sizes, heterogeneity in baseline skills, and a lack of long-term follow-up.While validated microsurgical training programmes improve skill acquisition, challenges remain in terms of standardisation and best cost-effective methods. Future research should prioritise evaluating predictive validity, creating standardised objective assessment tools, and focus on skill maintenance.`,
    mesh_terms: "[]",
    publication_types: `{"Journal Article",Review}`,
  },
  {
    id: "ffdd5e07-8f3e-4c74-9d12-5b4c1fb5a316",
    title: "Amino acid tracers in PET imaging of diffuse low-grade gliomas: a systematic review of preoperative applications.",
    journal_abbr: "Acta Neurochir (Wien)",
    abstract: `Positron emission tomography (PET) imaging using amino acid tracers has in recent years become widely used in the diagnosis and prediction of disease course in diffuse low-grade gliomas (LGG). However, implications of preoperative PET for treatment and prognosis in this patient group have not been systematically studied. The aim of this systematic review was to evaluate the preoperative diagnostic and prognostic value of amino acid PET in suspected diffuse LGG. Medline, Cochrane Library, and Embase databases were systematically searched using keywords "PET," "low-grade glioma," and "amino acids tracers" with their respective synonyms. Out of 2137 eligible studies, 28 met the inclusion criteria. Increased amino acid uptake (lesion/brain) was consistently reported among included studies; in 25-92% of subsequently histopathology-verified LGG, in 83-100% of histopathology-verified HGG, and also in some non-neoplastic lesions. No consistent results were found in studies reporting hot spot areas on PET in MRI-suspected LGG. Thus, the diagnostic value of amino acid PET imaging in suspected LGG has proven difficult to interpret, showing clear overlap and inconsistencies among reported results. Similarly, the results regarding the prognostic value of PET in suspected LGG and the correlation between uptake ratios and the molecular tumor status of LGG were conflicting. This systematic review illustrates the difficulties with prognostic studies presenting data on group-level without adjustment for established clinical prognostic factors, leading to a loss of additional prognostic information. We conclude that the prognostic value of PET is limited to analysis of histological subgroups of LGG and is probably strongest when using kinetic analysis of dynamic FET uptake parameters.`,
    mesh_terms: `[{"major": false, "descriptor": "Brain Neoplasms", "qualifiers": ["diagnostic imaging", "surgery"]}, {"major": false, "descriptor": "Carbon Radioisotopes", "qualifiers": []}, {"major": false, "descriptor": "Glioma", "qualifiers": ["diagnostic imaging", "surgery"]}, {"major": false, "descriptor": "Humans", "qualifiers": []}, {"major": false, "descriptor": "Methionine", "qualifiers": []}, {"major": false, "descriptor": "Positron-Emission Tomography", "qualifiers": ["methods"]}, {"major": false, "descriptor": "Preoperative Period", "qualifiers": []}, {"major": true, "descriptor": "Radiopharmaceuticals", "qualifiers": []}, {"major": false, "descriptor": "Tyrosine", "qualifiers": ["analogs & derivatives"]}]`,
    publication_types: `{"Journal Article","Research Support, Non-U.S. Gov't","Systematic Review"}`,
  },
  {
    id: "2184cfc7-c758-4892-94e7-577c16bd5d2a",
    title: "Visual Prostheses in the Era of Artificial Intelligence Technology.",
    journal_abbr: "Eye Brain",
    abstract: `BACKGROUND: Over the past few decades, technological advancements have transformed invasive visual prostheses from theoretical concepts into real-world applications. However, functional outcomes remain limited, especially in visual acuity. This review aims to summarize current developments in retinal and cortical prostheses (RCPs) and critically assess the role of artificial intelligence (AI) in advancing these systems.

PURPOSE: To describe current RCPs and provide a systematic review on image and signal processing algorithms designed for improved clinical outcomes.

PATIENTS AND METHODS: We performed a systematic review of the literature related to AI subserving prosthetic vision, using mainly PubMed, but also, Elicit, a dedicated AI-based reference research assistant. A total of 455 studies were screened on PubMed, of which 23 were retained for inclusion. An additional 5 studies were identified and included through Elicit.

RESULTS: The analysis of current RCPs highlights various limitations affecting the quality of the visual flow provided by current artificial vision. Indeed, the 28 reviewed studies on AI covered two applications for RCPs including extraction of saliency in camera captured images, and consistency between electrical stimulation and perceived phosphenes. A total of 14 out of 28 studies involved the use of artificial neural networks, of which 12 included model training. Evaluation with data from a visual prosthesis was conducted in 7 studies, including 1 that was prospectively assessed with a human RCP. Validation with empirical data from human or animal data was performed in 22 out of 28 studies. Out of these, 15 were validated using simulated prosthetic vision. Finally, out of 22 studies leveraging a mathematical model for phosphenes perception, 14 used a symmetrical oversimplified modeling.

CONCLUSION: AI algorithms show promise in optimizing prosthetic vision, particularly through enhanced image saliency extraction and stimulation strategies. However, most current studies are based on simulations. Further development and validation in real-world settings, especially through clinical testing with blind patients, are essential to assess their true effectiveness.`,
    mesh_terms: "[]",
    publication_types: `{"Journal Article",Review}`,
  },
];

const ARTICLE_TYPE_ALIASES: Record<string, string> = {
  "Systematic Review":       "Review",
  "Narrative Review":        "Review",
  "Scoping Review":          "Review",
  "Literature Review":       "Review",
  "Network Meta-analysis":   "Meta-analysis",
  "Systematic Meta-analysis":"Meta-analysis",
};

const VALID_ARTICLE_TYPES = new Set([
  "Meta-analysis", "Review", "Intervention study", "Non-interventional study",
  "Basic study", "Case", "Guideline", "Surgical Technique", "Tech",
  "Administration", "Letters & Notices", "Unclassified",
]);

async function score(article: typeof ARTICLES[0]) {
  const meshTerms = parseMeshTerms(article.mesh_terms);
  const pubTypes  = parsePgArray(article.publication_types).join(", ");

  const content = PROMPT_V4
    .replace(/\{\{title\}\}/g,             article.title)
    .replace(/\{\{journal\}\}/g,           article.journal_abbr)
    .replace(/\{\{abstract\}\}/g,          article.abstract)
    .replace(/\{\{mesh_terms\}\}/g,        meshTerms)
    .replace(/\{\{publication_types\}\}/g, pubTypes);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content }],
  });

  const rawText = (response.content[0] as { type: string; text: string }).text.trim();

  console.log("\n" + "=".repeat(80));
  console.log(`ID:    ${article.id}`);
  console.log(`Title: ${article.title}`);
  console.log(`\n--- RAW API RESPONSE TEXT ---`);
  console.log(rawText);
  console.log(`\n--- FULL API RESPONSE (stop_reason, usage) ---`);
  console.log(JSON.stringify({ stop_reason: response.stop_reason, usage: response.usage }, null, 2));

  // Parse
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText) as {
      article_type?: string;
      confidence?: number;
      rationale?: string;
    };
    const ARTICLE_TYPE_ALIASES: Record<string, string> = {
      "Systematic Review":       "Review",
      "Narrative Review":        "Review",
      "Scoping Review":          "Review",
      "Literature Review":       "Review",
      "Network Meta-analysis":   "Meta-analysis",
      "Systematic Meta-analysis":"Meta-analysis",
    };
    const rawType = parsed.article_type ?? "";
    const aliased = ARTICLE_TYPE_ALIASES[rawType];
    const mappedType = aliased ?? rawType;
    const stored = VALID_ARTICLE_TYPES.has(mappedType) ? mappedType : "Unclassified";
    const aliasNote = aliased ? ` → alias → "${aliased}"` : "";
    const invalidNote = !VALID_ARTICLE_TYPES.has(mappedType) ? ` ⚠ INVALID → "Unclassified"` : "";
    console.log(`\n→ Raw article_type:    "${rawType}"${aliasNote}${invalidNote}`);
    console.log(`→ Stored in DB:        "${stored}"`);
    console.log(`→ Confidence:          ${parsed.confidence}`);
    console.log(`→ Rationale:           ${parsed.rationale}`);
  } catch (e) {
    console.log(`\n⚠ JSON parse failed: ${e}`);
  }
}

async function main() {
  for (const article of ARTICLES) {
    await score(article);
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log("\n" + "=".repeat(80));
  console.log("Done.");
}

main().catch(console.error);
