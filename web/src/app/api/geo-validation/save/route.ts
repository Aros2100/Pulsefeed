import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const VERDICT_OPTIONS = ["correct", "wrong_value", "missing", "hallucinated", "fragment", "out_of_scope"] as const;
type Verdict = typeof VERDICT_OPTIONS[number];

const verdictField = z.enum(VERDICT_OPTIONS).optional();

const schema = z.object({
  pubmed_id:    z.string(),
  affiliation:  z.string().nullable(),
  bucket:       z.string(),
  out_of_scope: z.boolean().default(false),
  pipeline: z.object({
    country:     z.string().nullable(),
    city:        z.string().nullable(),
    state:       z.string().nullable(),
    institution: z.string().nullable(),
    department:  z.string().nullable(),
  }),
  pipeline_source_per_field: z.record(z.string(), z.enum(["parser", "enrichment", "ai"])),
  truth: z.object({
    country:     z.string().nullable(),
    city:        z.string().nullable(),
    state:       z.string().nullable(),
    institution: z.string().nullable(),
    department:  z.string().nullable(),
  }),
  fragment: z.object({
    institution: z.boolean().default(false),
    department:  z.boolean().default(false),
  }).default({ institution: false, department: false }),
  verdictOverride: z.object({
    country:     verdictField,
    city:        verdictField,
    state:       verdictField,
    institution: verdictField,
    department:  verdictField,
  }).optional(),
  notes: z.string().nullable().optional(),
});

function computeVerdict(
  pipelineVal: string | null,
  truthVal: string | null,
  isFragment: boolean
): Verdict {
  const pNorm = (pipelineVal ?? "").trim().toLowerCase();
  const tNorm = (truthVal ?? "").trim().toLowerCase();
  const pEmpty = pNorm === "";
  const tEmpty = tNorm === "";

  if (isFragment) return "fragment";
  if (pEmpty && tEmpty) return "correct";
  if (pEmpty && !tEmpty) return "missing";
  if (!pEmpty && tEmpty) return "hallucinated";
  if (pNorm === tNorm) return "correct";
  return "wrong_value";
}

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

  const { pubmed_id, affiliation, bucket, out_of_scope, pipeline, pipeline_source_per_field, truth, fragment, verdictOverride, notes } = parsed.data;

  const fields = ["country", "city", "state", "institution", "department"] as const;
  const verdicts: Record<string, Verdict> = {};

  if (out_of_scope) {
    // All verdict fields forced to out_of_scope regardless of truth values
    for (const f of fields) verdicts[f] = "out_of_scope";
  } else {
    for (const f of fields) {
      const override = verdictOverride?.[f];
      if (override) {
        verdicts[f] = override;
      } else {
        const isFragment = (f === "institution" && fragment.institution) || (f === "department" && fragment.department);
        verdicts[f] = computeVerdict(pipeline[f], truth[f], isFragment);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin.from("geo_validation_results").insert({
    pubmed_id,
    validated_at:              new Date().toISOString(),
    validated_by:              auth.userId,
    affiliation:               affiliation ?? "",
    out_of_scope,
    pipeline_country:          pipeline.country,
    pipeline_city:             pipeline.city,
    pipeline_state:            pipeline.state,
    pipeline_institution:      pipeline.institution,
    pipeline_department:       pipeline.department,
    pipeline_source_per_field,
    truth_country:             truth.country,
    truth_city:                truth.city,
    truth_state:               truth.state,
    truth_institution:         truth.institution,
    truth_department:          truth.department,
    verdict_country:           verdicts.country,
    verdict_city:              verdicts.city,
    verdict_state:             verdicts.state,
    verdict_institution:       verdicts.institution,
    verdict_department:        verdicts.department,
    bucket,
    notes:                     notes ?? null,
  });

  if (error) {
    console.error("[geo-validation/save]", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
