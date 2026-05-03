import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { buildRenderParams, isoWeekSaturday } from "@/lib/newsletter/send";
import { renderNewsletterHtml } from "@/lib/newsletter/render";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { issueId } = await params;
  const subPreset = Math.max(1, Math.min(4, parseInt(request.nextUrl.searchParams.get("subPreset") ?? "2", 10)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Get edition basics for the week
  const { data: edition, error: editionErr } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year")
    .eq("id", issueId)
    .single();

  if (editionErr || !edition) {
    return NextResponse.json({ ok: false, error: "Edition not found" }, { status: 404 });
  }

  // Pick the first N subspecialties that have articles in this edition
  const { data: editionSubs } = await admin
    .from("newsletter_edition_articles")
    .select("subspecialty")
    .eq("edition_id", issueId)
    .neq("subspecialty", "No subspecialty");

  const subSet = [...new Set(((editionSubs ?? []) as { subspecialty: string }[]).map((r) => r.subspecialty))];

  // Order them by subspecialty sort_order
  const { data: subMeta } = await admin
    .from("subspecialties")
    .select("name, short_name, sort_order")
    .eq("specialty", ACTIVE_SPECIALTY)
    .eq("active", true)
    .in("name", subSet.length > 0 ? subSet : ["__none__"])
    .order("sort_order");

  const orderedSubs = ((subMeta ?? []) as { name: string }[]).map((s) => s.name);
  const previewSubNames = orderedSubs.slice(0, subPreset);

  const paramsResult = await buildRenderParams(
    admin,
    issueId,
    auth.userId ?? "",
    null,
    { previewSubNames }
  );

  if ("error" in paramsResult) {
    return NextResponse.json({ ok: false, error: paramsResult.error }, { status: 422 });
  }

  // Use the correct Saturday as issue date
  const saturdayDate = isoWeekSaturday(edition.week_number, edition.year);
  const html = renderNewsletterHtml({ ...paramsResult, issueDate: saturdayDate, firstName: null });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
