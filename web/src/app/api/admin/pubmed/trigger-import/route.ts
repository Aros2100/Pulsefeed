import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runImport } from "@/lib/pubmed/importer";
import { runCitationFetch } from "@/lib/pubmed/fetch-citations";
import { runLocationParsing } from "@/lib/geo/location-scorer";
import { runAILocationParsing } from "@/lib/geo/ai-location-scorer";
import { runPublicationTypeMapping } from "@/lib/tagging/publication-type-mapper";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let filterId: string | undefined;
  try {
    const body = (await request.json()) as { filterId?: string };
    filterId = body.filterId || undefined;
  } catch {
    // Body is optional
  }

  // Fire-and-forget — runImport opretter selv import_logs rækker pr. filter
  void runImport(filterId, false, undefined, "manual");

  after(async () => {
    await runCitationFetch(200);
  });

  after(async () => {
    try {
      const parseResult = await runLocationParsing(200);
      console.log("[geo/auto-parse]", parseResult);
      if (parseResult.lowConfidence > 0) {
        try {
          const aiResult = await runAILocationParsing(parseResult.lowConfidence);
          console.log("[geo/ai-parse]", aiResult);
        } catch (e) {
          console.error("[geo/ai-parse] failed:", e);
        }
      }
    } catch (e) {
      console.error("[geo/auto-parse] error:", e);
    }
  });

  after(() => {
    runPublicationTypeMapping(200).then(r => console.log("[pubtype-map]", r)).catch(e => console.error("[pubtype-map] error:", e));
  });

  return NextResponse.json({ ok: true });
}
