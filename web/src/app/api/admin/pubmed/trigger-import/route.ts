import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runImport } from "@/specialties/neurosurgery/filter-c1";
import { runCitationFetch } from "@/lib/import/fetch-citations";
import { runAILocationParsing } from "@/lib/geo/ai-location-scorer";
import { runPublicationTypeMapping } from "@/lib/tagging/publication-type-mapper";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let filterId: string | undefined;
  let mindate: string | undefined;
  let maxdate: string | undefined;
  try {
    const body = (await request.json()) as { filterId?: string; mindate?: string; maxdate?: string };
    filterId = body.filterId || undefined;
    mindate = body.mindate || undefined;
    maxdate = body.maxdate || undefined;
  } catch {
    // Body is optional
  }

  after(async () => {
    await runImport(filterId, false, undefined, "manual", undefined, mindate, maxdate);
  });

  after(async () => {
    await runCitationFetch(200);
  });

  after(async () => {
    try {
      const aiResult = await runAILocationParsing(200);
    } catch (e) {
      console.error("[geo/ai-parse] failed:", e);
    }
  });

  after(() => {
  });

  return NextResponse.json({ ok: true });
}
