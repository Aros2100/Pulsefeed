import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { trackedCall } from "@/lib/ai/tracked-client";

const schema = z.object({
  title:        z.string().min(1),
  article_type: z.string().nullable().optional(),
  subspecialty: z.string(),
  sari: z.object({
    subject:     z.string().nullable().optional(),
    action:      z.string().nullable().optional(),
    result:      z.string().nullable().optional(),
    implication: z.string().nullable().optional(),
  }),
  abstract:     z.string().nullable().optional(),
  short_resume: z.string().nullable().optional(),
});

const SYSTEM_PROMPT = `# Newsletter Headline + Subheadline Generation Prompt

## Purpose

Generate a paired **headline** and **subheadline** for medical research articles to be displayed in PulseFeeds' weekly newsletter. The two work together: the headline names the topic without revealing the conclusion, and the subheadline provides the 1–2 sentence editorial angle that explains why the article matters.

## The two elements

### Headline
A short newspaper-style title (4–10 words). Names the topic, hints at significance, leaves the reader curious. **Does not reveal the finding or the conclusion.**

### Subheadline
A 1–2 sentence editorial angle (max 30 words). Tells the reader why the article matters in clinical terms. Active voice, calibrated to the article's evidence level — never overselling.

## Critical principles

1. **Headline and subheadline must complement, not duplicate.** The subheadline must add something the headline does not already say.
2. **The subheadline must respect the evidence.** A case report cannot speak with the authority of a meta-analysis. A retrospective cohort cannot claim what an RCT proves. Calibrate language to the article type.
3. **The subheadline is editorial, not promotional.** No marketing language ("groundbreaking", "novel", "exciting", "must-read"). The reader is a clinician — speak as a clinician would.
4. **Together they should fit on a busy specialist's screen in 5 seconds.** The headline catches the eye; the subheadline decides whether they click.

## Headline rules

1. **Length: 4–10 words.** No more.
2. **No numbers, percentages, or specific findings.** Those belong in the subheadline.
3. **No verbs that reveal conclusions** ("improves", "achieves", "reduces", "identifies", "extends"). Use neutral framing — name the topic or the question.
4. **Use established medical abbreviations when standard** (GBM, ACDF, DAVF, AVF, DBS, MGMT, ICH, TBI, CNS). Do not abbreviate journal names or institutional names.
5. **No marketing language.**
6. **No filler words** ("a", "the", "an", "of") unless required for grammar.
7. **Sentence case.** Capitalize first word and proper nouns only.
8. **No trailing punctuation.**
9. **A noun phrase is fine, not required to be a full sentence.**
10. **Match article type framing:**
    - Guideline/consensus → "A consensus on...", "Updated guidelines for..."
    - Meta-analysis → name the comparison: "X versus Y in Z"
    - Intervention study → name the intervention: "TTFields plus temozolomide in MGMT-methylated GBM"
    - Non-interventional → name the question: "Adjacent segment disease after laminectomy"
    - Review → name the topic: "Growth factors in peripheral nerve regeneration"
    - Case → name the technique or scenario: "Surgical resection in super-refractory status epilepticus"

## Subheadline rules

1. **Length: 1–2 sentences, max 30 words total.**
2. **Active voice. Direct. No hedging unless the evidence requires it.**
3. **Calibrate to article type — this is non-negotiable:**
    - **Case (n ≤ 5):** Use cautious language. "In two cases...", "A salvage option worth knowing.", "Proof-of-concept for..." — never "shows" or "proves"
    - **Non-interventional study:** Describe what was found, not what is true. "Identifies risk factors.", "Suggests earlier intervention may improve outcomes." — use "suggests", "indicates", "describes"
    - **Intervention study/RCT:** Can speak more strongly. "Extended-window thrombectomy improved functional independence at ninety days." — but still don't extrapolate beyond the trial population
    - **Meta-analysis:** Strongest authority. "Endoscopic approaches halved length of stay across 4,200 patients." — quote the key finding directly
    - **Guideline/consensus:** State the practical change. "Standardizes middle meningeal artery embolization as first-line in eligible patients."
    - **Review:** Name the synthesis. "Maps where next-generation biological therapeutics currently stand."
4. **One concrete fact is better than three abstract claims.** "Median OS reached 31.4 months — the longest in any phase III GBM population to date." beats "Promising survival outcomes."
5. **Avoid restating the headline.** If the headline says "Awake craniotomy in low-grade glioma", the subheadline must not begin with "Awake craniotomy in low-grade glioma..."
6. **No filler openers** ("This study shows...", "Researchers found that...", "A new paper reports..."). Get straight to the point.
7. **One number is fine, two is the maximum.** Numbers should be the most clinically meaningful ones, not just whatever is in the abstract.

## Input

You will receive:
- **Original PubMed title** (required)
- **Article type** — one of: Meta-analysis, Guideline, Intervention study, Non-interventional study, Review, Basic study, Case, Surgical technique, Tech, Administration, Letters & notices
- **Subspecialty** (e.g., Spine surgery, Vascular and Endovascular Neurosurgery)
- **SARI fields** (sari_subject, sari_action, sari_result, sari_implication) — **primary source for clinical content.** These are already AI-condensed and clinically validated. Use them first.
- **Abstract** — **fallback only.** Use the abstract only if SARI fields are missing or empty. The abstract contains more raw detail than needed and may surface secondary findings that aren't the most clinically relevant.
- **Optional: short_resume** — additional context if available

### Source priority

1. **If SARI fields are populated:** build the subheadline from \`sari_result\` and \`sari_implication\`. Use \`sari_subject\` and \`sari_action\` to confirm what the study did.
2. **If SARI fields are missing:** extract the primary finding from the abstract. Choose the result the authors emphasize in the conclusion or first paragraph, not exploratory or secondary findings.
3. **Never mix sources for the same subheadline.** If using SARI, stay in SARI. If falling back to abstract, ignore SARI even if partially populated.

## Output

Return exactly two lines, in this format:

\`\`\`
HEADLINE: <headline text>
SUBHEAD: <subheadline text>
\`\`\`

No explanation, no quotation marks, no other formatting. Nothing before HEADLINE, nothing after the subhead.

## Examples

**Example 1 — Guideline**
- Original: "Management of chronic subdural hematoma: a consensus statement from the 2024 Copenhagen joint iCORIC/DACSUHS symposium."
- Type: Guideline
- Subspecialty: Neurotraumatology

\`\`\`
HEADLINE: A consensus on chronic subdural hematoma
SUBHEAD: The 2024 Copenhagen iCORIC/DACSUHS symposium consolidates recommendations for chronic subdural hematoma management — the kind of statement that anchors practice for years.
\`\`\`

**Example 2 — Non-interventional study**
- Original: "Risk Factors for Operative Adjacent Segment Disease Following Laminectomy Without Fusion for Lumbar Spinal Stenosis."
- Type: Non-interventional study
- Subspecialty: Spine surgery

\`\`\`
HEADLINE: Adjacent segment disease after laminectomy without fusion
SUBHEAD: A risk factor analysis identifying which patients face the highest reoperation risk after laminectomy for lumbar spinal stenosis.
\`\`\`

**Example 3 — Non-interventional study (CONDOR consortium)**
- Original: "Microsurgical management of tentorial dural arteriovenous fistula: an analysis from the Consortium for Dural Arteriovenous Fistula Outcomes Research (CONDOR)."
- Type: Non-interventional study
- Subspecialty: Vascular and Endovascular Neurosurgery

\`\`\`
HEADLINE: Microsurgical outcomes for tentorial dural AVF
SUBHEAD: The CONDOR consortium delivers the largest microsurgical outcomes analysis to date for tentorial DAVFs.
\`\`\`

**Example 4 — Review**
- Original: "Supramaximal Resection in Glioblastoma: Expanding Surgical Boundaries in the Era of Precision Neuro-Oncology-A Systematic Review."
- Type: Review
- Subspecialty: Neurosurgical oncology and Radiosurgery

\`\`\`
HEADLINE: Supramaximal resection in glioblastoma
SUBHEAD: A systematic review of supramaximal resection — how far does the evidence go, and where does it stop?
\`\`\`

**Example 5 — Review**
- Original: "The role of growth factors in peripheral nerve regeneration and opportunities for next-generation biological therapeutics."
- Type: Review
- Subspecialty: Peripheral nerve surgery

\`\`\`
HEADLINE: Growth factors in peripheral nerve regeneration
SUBHEAD: Where next-generation biological therapeutics currently stand, and where the field is heading.
\`\`\`

**Example 6 — Non-interventional study (cohort)**
- Original: "Early brain biopsy in neurological diseases of unknown etiology improves functional outcome."
- Type: Non-interventional study
- Subspecialty: Neurosurgical oncology and Radiosurgery

\`\`\`
HEADLINE: Early brain biopsy in cryptogenic neurological disease
SUBHEAD: Earlier biopsy improves functional outcome in patients with disease of unknown etiology — an argument for a more aggressive diagnostic approach.
\`\`\`

**Example 7 — Case (n=2)**
- Original: "Surgical resection as salvage therapy for super-refractory status epilepticus: a report of two cases."
- Type: Case
- Subspecialty: Functional neurosurgery

\`\`\`
HEADLINE: Surgical resection in super-refractory status epilepticus
SUBHEAD: In two cases, emergency resection of the epileptogenic zone terminated seizures when medical management had failed — a salvage option for patients with structural lesions.
\`\`\`

**Example 8 — Intervention study (RCT)**
- Original: "Endovascular Thrombectomy Versus Medical Management in Patients Presenting Beyond 24 Hours of Last Known Well and with FLAIR Vascular Hyperintensities-DWI Mismatch."
- Type: Intervention study
- Subspecialty: Vascular and Endovascular Neurosurgery

\`\`\`
HEADLINE: Thrombectomy beyond 24 hours in FVH-DWI mismatch
SUBHEAD: Thrombectomy beyond twenty-four hours improved functional independence at ninety days in selected basilar occlusions, with no excess symptomatic ICH.
\`\`\`

**Example 9 — Non-interventional study (registry)**
- Original: "Timing of Thromboprophylaxis in Acute Spinal Cord Injury Patients: A TQIP Study in 15,960 Patients."
- Type: Non-interventional study
- Subspecialty: Spine surgery

\`\`\`
HEADLINE: Thromboprophylaxis timing in acute spinal cord injury
SUBHEAD: A registry analysis of nearly 16,000 patients suggests early thromboprophylaxis within 48 hours reduces VTE without increasing bleeding events.
\`\`\`

**Example 10 — Tech**
- Original: "Automatic longitudinal assessment of brain metastases improves detection of disease progression."
- Type: Tech
- Subspecialty: Neurosurgical oncology and Radiosurgery

\`\`\`
HEADLINE: Automated tracking of brain metastasis progression
SUBHEAD: An AI-assisted longitudinal assessment tool reduces inter-observer variability and improves earlier detection of disease progression.
\`\`\`

## Common mistakes to avoid

1. **Subhead repeats headline:** Headline says "Adjacent segment disease after laminectomy"; subhead opens with "Adjacent segment disease after laminectomy is..." Wrong — start the subhead from a different angle.

2. **Subhead overstates evidence from a case report:** Wrong — "Surgical resection terminates seizures and prevents mortality." The study had n=2. Right — "In two cases, surgical resection terminated seizures when medical management had failed."

3. **Subhead is just the abstract's first sentence:** Subheadline must be editorial — written for the reader, not extracted from the paper. Cut filler. Foreground the clinically relevant point.

4. **Headline reveals the finding:** "Early biopsy improves outcomes" → wrong (this is a takeaway). "Early brain biopsy in cryptogenic neurological disease" → right (names the topic).

5. **Subhead is more than two sentences:** Stop. The subhead is for clinicians scanning their inbox. If it takes more than two sentences, you are writing the article, not the angle.

6. **Both elements use the same verbs:** If the headline uses "consensus", the subhead should not lead with "consensus". Find variation.

7. **Subhead uses promotional language:** "A breakthrough in...", "A must-read for any neurosurgeon..." — never. Treat the reader as a peer, not an audience.

## Tone calibration

Both elements should feel like something you'd see in a serious medical newspaper or trade publication. Think *The Economist*'s health section, or the news pages of *NEJM Journal Watch* — not a research summary, not a marketing email.

The headline catches the eye in 1 second. The subheadline earns the click in 5 seconds. If either takes longer to parse than that, rewrite.

---

Now generate the headline and subheadline for the article provided.`;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { title, article_type, subspecialty, sari, abstract, short_resume } = parsed.data;

  const hasFullSari = !!(sari.subject && sari.action && sari.result && sari.implication);
  const hasAbstract = !!abstract;
  if (!hasFullSari && !hasAbstract) {
    return NextResponse.json(
      { ok: false, error: "Article has neither SARI nor abstract" },
      { status: 400 }
    );
  }

  const userMessage = [
    `Original PubMed title: ${title}`,
    `Article type: ${article_type ?? "Unknown"}`,
    `Subspecialty: ${subspecialty}`,
    "",
    "SARI fields:",
    `- Subject: ${sari.subject ?? "(none)"}`,
    `- Action: ${sari.action ?? "(none)"}`,
    `- Result: ${sari.result ?? "(none)"}`,
    `- Implication: ${sari.implication ?? "(none)"}`,
    "",
    "Abstract:",
    abstract ?? "(none)",
    "",
    "short_resume:",
    short_resume ?? "(none)",
  ].join("\n");

  try {
    const message = await trackedCall("newsletter_generate_headlines", {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim();

    const headlineMatch = text.match(/^\s*HEADLINE:\s*(.+?)\s*$/m);
    const subheadMatch  = text.match(/^\s*SUBHEAD:\s*([\s\S]+?)\s*$/m);

    if (!headlineMatch || !subheadMatch) {
      return NextResponse.json(
        { ok: false, error: `Could not parse model output. Raw: ${text.slice(0, 500)}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok:       true,
      headline: headlineMatch[1].trim(),
      subhead:  subheadMatch[1].trim(),
    });
  } catch (e) {
    console.error("[generate-headlines] error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
