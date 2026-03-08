import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const ALLOWED_SORT = ["title", "journal_abbr", "published_date", "imported_at", "circle", "status", "verified", "evidence_score"] as const;

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);

  const page    = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit   = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "50", 10)));
  const circle  = searchParams.get("circle");
  const status  = searchParams.get("status");
  const specialty = searchParams.get("specialty");
  const verified        = searchParams.get("verified");
  const approvalMethod  = searchParams.get("approval_method");
  const hasAbstract     = searchParams.get("has_abstract");
  const dateFrom = searchParams.get("date_from");
  const dateTo   = searchParams.get("date_to");
  const search   = searchParams.get("search")?.trim() ?? "";
  const sortBy   = searchParams.get("sort_by") ?? "imported_at";
  const sortAsc  = searchParams.get("sort_dir") === "asc";

  const safeSortBy = (ALLOWED_SORT as readonly string[]).includes(sortBy) ? sortBy : "imported_at";
  const start = (page - 1) * limit;
  const end   = start + limit - 1;

  let query = admin
    .from("articles")
    .select("id, title, journal_abbr, published_date, imported_at, authors, status, circle, specialty_tags, verified, abstract, evidence_score", { count: "exact" });

  if (circle)    query = query.eq("circle", parseInt(circle, 10));
  if (status)    query = query.eq("status", status);
  if (specialty) query = query.contains("specialty_tags", [specialty]);
  if (verified === "true")  query = query.eq("verified", true);
  if (verified === "false") query = query.eq("verified", false);
  if (approvalMethod === "null")  query = query.is("approval_method" as never, null as never);
  else if (approvalMethod)        query = query.eq("approval_method" as never, approvalMethod as never);
  if (hasAbstract === "true")  query = query.not("abstract", "is", null);
  if (hasAbstract === "false") query = query.is("abstract", null);
  if (dateFrom) query = query.gte("published_date", dateFrom);
  if (dateTo)   query = query.lte("published_date", dateTo);
  if (search)   query = query.or(`title.ilike.%${search}%,journal_abbr.ilike.%${search}%`);

  const { data, error, count } = await query
    .order(safeSortBy, { ascending: sortAsc })
    .range(start, end);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 });
}
