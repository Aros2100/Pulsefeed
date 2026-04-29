import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

type RpcRow = {
  pubmed_id: string;
  affiliation: string | null;
  after_city: string | null;
  after_state: string | null;
  after_country: string | null;
  after_institution: string | null;
  after_department: string | null;
  enriched_state: string | null;
  enriched_state_source: string | null;
  ai_fields: string[] | null;
  ai_needed: string;
};

type ProgressRow = {
  bucket: string;
  total: number;
  validated: number;
};

function deriveSource(
  fieldName: string,
  enrichedState: string | null,
  aiFields: string[] | null
): "parser" | "enrichment" | "ai" {
  if (fieldName === "state" && enrichedState !== null) return "enrichment";
  if (aiFields && aiFields.includes(fieldName)) return "ai";
  return "parser";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket");
  if (!bucket) {
    return NextResponse.json({ ok: false, error: "bucket is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [{ data: rows, error }, { data: progressRows, error: progressError }] = await Promise.all([
    admin.rpc("get_next_geo_validation_article", { p_bucket: bucket }),
    admin.rpc("get_geo_validation_progress"),
  ]);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (progressError) return NextResponse.json({ ok: false, error: progressError.message }, { status: 500 });

  const row = (rows as RpcRow[])?.[0] ?? null;
  const progress = (progressRows as ProgressRow[]) ?? [];

  if (!row) {
    return NextResponse.json({ ok: true, article: null, progress });
  }

  const aiFields = row.ai_fields ?? [];
  const fields = ["country", "city", "state", "institution", "department"] as const;
  const sourcePerField: Record<string, "parser" | "enrichment" | "ai"> = {};
  for (const f of fields) {
    sourcePerField[f] = deriveSource(f, row.enriched_state, aiFields);
  }

  const article = {
    pubmed_id: row.pubmed_id,
    affiliation: row.affiliation,
    bucket: row.ai_needed,
    pipeline: {
      country:     row.after_country,
      city:        row.after_city,
      state:       row.enriched_state ?? row.after_state,
      institution: row.after_institution,
      department:  row.after_department,
    },
    sourcePerField,
  };

  return NextResponse.json({ ok: true, article, progress });
}
