import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReparseAuthorGeoButton } from "./ReparseAuthorGeoButton";
import { ParseArticleLocationsButton } from "./ParseArticleLocationsButton";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  articles_imported: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtSyncRun(runTime: string | null) {
  if (!runTime) return "—";
  return new Date(runTime + ":00").toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function num(v: number) { return v.toLocaleString("da-DK"); }
function dash(v: number | null | undefined) { return v != null && v > 0 ? num(v) : "—"; }

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "32px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const headerLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.08em",
  textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
  borderBottom: "1px solid #eef0f4", background: "#f8f9fb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px", fontSize: "13px", color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7", fontVariantNumeric: "tabular-nums",
};

const kpiLabel: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "4px",
};

const BADGES = {
  1: { label: "C1", bg: "#dbeafe", text: "#1d4ed8" },
  2: { label: "C2", bg: "#f3e8ff", text: "#7c3aed" },
  3: { label: "C3", bg: "#fff7ed", text: "#c2410c" },
} as const;

function CircleBadge({ circle }: { circle: 1 | 2 | 3 }) {
  const b = BADGES[circle];
  return (
    <span style={{
      fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
      background: b.bg, color: b.text, marginRight: "6px",
    }}>
      {b.label}
    </span>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: "11px", letterSpacing: "0.08em",
      color: "#5a6a85", textTransform: "uppercase",
      fontWeight: 700, marginBottom: "12px",
    }}>
      {title}
    </div>
  );
}

interface PeriodRow {
  label: string;
  today: number;
  week: number;
  month: number;
  year: number;
  total: number;
}

function PeriodTable({ rows }: { rows: PeriodRow[] }) {
  const cols = ["I dag", "Denne uge", "Denne måned", "I år", "Total"];
  return (
    <div style={{ borderBottom: "1px solid #eef0f4", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: "160px" }}></th>
            {cols.map(c => <th key={c} style={thStyle}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td style={{ ...tdStyle, fontWeight: 700, color: "#5a6a85", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {row.label}
              </td>
              {[row.today, row.week, row.month, row.year, row.total].map((v, i) => (
                <td key={i} style={{ ...tdStyle, fontSize: "20px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{num(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ImportDashboardPage() {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  // Direct article counts per circle+status (bypasses RPC for accuracy)
  const countQ = (circle: number, status: string) =>
    a.from("articles").select("id", { count: "exact", head: true })
      .eq("circle", circle).eq("status", status) as Promise<{ count: number | null }>;

  const [
    c1ApprovedRes, c2ApprovedRes, c2PendingRes, c2RejectedRes,
    c3ApprovedRes, c3PendingRes, c3RejectedRes,
    totalArticlesRes,
    authorsResult, unlinkedResult, unlinkedSlotsResult,
    latestC1LogResult, latestC2LogResult, latestC3LogResult,
    latestLinkingRunResult,
    articlesTodayRes, articlesWeekRes, articlesMonthRes, articlesYearRes,
    authorsTodayRes, authorsWeekRes, authorsMonthRes, authorsYearRes, authorsTotalRes,
    openalexTodayRes, openalexWeekRes, openalexMonthRes, openalexYearRes, openalexTotalRes,
    uverTodayRes, uverWeekRes, uverMonthRes, uverYearRes, uverTotalRes,
    syncLogRes,
    neverSyncedRes, retractedTotalRes, authorsChangedRes,
    authorUpdateEventsRes,
  ] = await Promise.all([
    // Article counts per circle+status
    countQ(1, "approved"), countQ(2, "approved"), countQ(2, "pending"), countQ(2, "rejected"),
    countQ(3, "approved"), countQ(3, "pending"), countQ(3, "rejected"),
    // Total articles
    admin.from("articles").select("id", { count: "exact", head: true }),
    // Authors
    admin.from("authors").select("*", { count: "exact", head: true }),
    admin.rpc("count_unlinked_articles"),
    admin.rpc("count_unlinked_author_slots"),
    // Latest completed import log per circle
    admin.from("pubmed_filters").select("id").eq("specialty", ACTIVE_SPECIALTY).eq("circle", 1)
      .then(async (fRes: { data: { id: string }[] | null }) => {
        const ids = (fRes.data ?? []).map((f) => f.id);
        if (ids.length === 0) return { data: null };
        return admin.from("import_logs").select("started_at, articles_imported")
          .eq("status", "completed").in("filter_id", ids)
          .order("started_at", { ascending: false }).limit(1).maybeSingle();
      }),
    admin.from("pubmed_filters").select("id").eq("specialty", ACTIVE_SPECIALTY).eq("circle", 2)
      .then(async (fRes: { data: { id: string }[] | null }) => {
        const ids = (fRes.data ?? []).map((f) => f.id);
        if (ids.length === 0) return { data: null };
        return admin.from("import_logs").select("started_at, articles_imported")
          .eq("status", "completed").in("filter_id", ids)
          .order("started_at", { ascending: false }).limit(1).maybeSingle();
      }),
    a.from("import_logs").select("started_at, articles_imported")
      .eq("status", "completed").eq("circle", 3)
      .order("started_at", { ascending: false }).limit(1)
      .maybeSingle() as Promise<{ data: ImportLog | null }>,
    admin.from("author_linking_logs")
      .select("started_at")
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Article counts by period (imported_at)
    a.from("articles").select("id", { count: "exact", head: true })
      .gte("imported_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
    a.from("articles").select("id", { count: "exact", head: true })
      .gte("imported_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    a.from("articles").select("id", { count: "exact", head: true })
      .gte("imported_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    a.from("articles").select("id", { count: "exact", head: true })
      .gte("imported_at", new Date(new Date().getFullYear(), 0, 1).toISOString()),
    // Author linking: sum of authors_processed by period (started_at, status = completed)
    a.from("author_linking_logs").select("authors_processed").eq("status", "completed")
      .gte("started_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
    a.from("author_linking_logs").select("authors_processed").eq("status", "completed")
      .gte("started_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    a.from("author_linking_logs").select("authors_processed").eq("status", "completed")
      .gte("started_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    a.from("author_linking_logs").select("authors_processed").eq("status", "completed")
      .gte("started_at", new Date(new Date().getFullYear(), 0, 1).toISOString()),
    a.from("author_linking_logs").select("authors_processed").eq("status", "completed"),
    // OpenAlex: authors with openalex_enriched_at IS NOT NULL, counted by openalex_enriched_at
    a.from("authors").select("id", { count: "exact", head: true })
      .not("openalex_enriched_at", "is", null)
      .gte("openalex_enriched_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .not("openalex_enriched_at", "is", null)
      .gte("openalex_enriched_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .not("openalex_enriched_at", "is", null)
      .gte("openalex_enriched_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .not("openalex_enriched_at", "is", null)
      .gte("openalex_enriched_at", new Date(new Date().getFullYear(), 0, 1).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .not("openalex_enriched_at", "is", null),
    // Uverificeret: verified_by = 'uverificeret', counted by created_at
    a.from("authors").select("id", { count: "exact", head: true })
      .eq("verified_by", "uverificeret")
      .gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .eq("verified_by", "uverificeret")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .eq("verified_by", "uverificeret")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .eq("verified_by", "uverificeret")
      .gte("created_at", new Date(new Date().getFullYear(), 0, 1).toISOString()),
    a.from("authors").select("id", { count: "exact", head: true })
      .eq("verified_by", "uverificeret"),
    // PubMed Sync
    a.rpc("pubmed_sync_log_runs"),
    a.from("articles").select("id", { count: "exact", head: true }).is("pubmed_synced_at", null),
    a.from("articles").select("id", { count: "exact", head: true }).eq("retracted", true),
    a.from("articles").select("id", { count: "exact", head: true }).eq("authors_changed", true),
    // Forfatter-opdateringer
    a.from("article_events").select("payload").eq("event_type", "authors_updated"),
  ]);

  // ── Article stats ──
  const c1Approved = (c1ApprovedRes as { count: number | null }).count ?? 0;
  const c2Approved = (c2ApprovedRes as { count: number | null }).count ?? 0;
  const c2Pending  = (c2PendingRes as { count: number | null }).count ?? 0;
  const c2Rejected = (c2RejectedRes as { count: number | null }).count ?? 0;
  const c3Approved = (c3ApprovedRes as { count: number | null }).count ?? 0;
  const c3Pending  = (c3PendingRes as { count: number | null }).count ?? 0;
  const c3Rejected = (c3RejectedRes as { count: number | null }).count ?? 0;
  const totalArticles = totalArticlesRes.count ?? 0;

  // Latest import per circle
  const latestC1 = latestC1LogResult.data as ImportLog | null;
  const latestC2 = latestC2LogResult.data as ImportLog | null;
  const latestC3 = (latestC3LogResult as { data: ImportLog | null }).data;

  // Author stats
  const totalAuthors = authorsResult.count ?? 0;
  const unlinkedArticles = (unlinkedResult.data as unknown as number) ?? 0;
  const unlinkedAuthorSlots = (unlinkedSlotsResult.data as unknown as number) ?? 0;
  const latestLinkingRun = fmt((latestLinkingRunResult as { data: { started_at: string } | null }).data?.started_at ?? null);

  // Article period counts
  const articlesToday = (articlesTodayRes as { count: number | null }).count ?? 0;
  const articlesWeek  = (articlesWeekRes  as { count: number | null }).count ?? 0;
  const articlesMonth = (articlesMonthRes as { count: number | null }).count ?? 0;
  const articlesYear  = (articlesYearRes  as { count: number | null }).count ?? 0;

  // Author period sums
  const sumAuthors = (rows: { authors_processed: number }[]) =>
    rows.reduce((s, r) => s + (r.authors_processed ?? 0), 0);

  const authorsToday = sumAuthors((authorsTodayRes.data ?? []) as { authors_processed: number }[]);
  const authorsWeek  = sumAuthors((authorsWeekRes.data  ?? []) as { authors_processed: number }[]);
  const authorsMonth = sumAuthors((authorsMonthRes.data ?? []) as { authors_processed: number }[]);
  const authorsYear  = sumAuthors((authorsYearRes.data  ?? []) as { authors_processed: number }[]);
  const authorsTotal = sumAuthors((authorsTotalRes.data ?? []) as { authors_processed: number }[]);

  // OpenAlex period counts
  const openalexToday = (openalexTodayRes as { count: number | null }).count ?? 0;
  const openalexWeek  = (openalexWeekRes  as { count: number | null }).count ?? 0;
  const openalexMonth = (openalexMonthRes as { count: number | null }).count ?? 0;
  const openalexYear  = (openalexYearRes  as { count: number | null }).count ?? 0;
  const openalexTotal = (openalexTotalRes as { count: number | null }).count ?? 0;

  // Uverificeret period counts
  const uverToday = (uverTodayRes as { count: number | null }).count ?? 0;
  const uverWeek  = (uverWeekRes  as { count: number | null }).count ?? 0;
  const uverMonth = (uverMonthRes as { count: number | null }).count ?? 0;
  const uverYear  = (uverYearRes  as { count: number | null }).count ?? 0;
  const uverTotal = (uverTotalRes as { count: number | null }).count ?? 0;

  // PubMed Sync stats
  const latestRun = (syncLogRes.data?.[0] ?? null) as { run_time: string; imported: string | number; updated: string | number; retracted: string | number } | null;
  const lastSyncedAt     = latestRun?.run_time ?? null;
  const lastRunImported  = Number(latestRun?.imported  ?? 0);
  const lastRunUpdated   = Number(latestRun?.updated   ?? 0);
  const lastRunRetracted = Number(latestRun?.retracted ?? 0);
  const neverSynced    = (neverSyncedRes    as { count: number | null }).count ?? 0;
  const retractedTotal = (retractedTotalRes as { count: number | null }).count ?? 0;
  const authorsChanged = (authorsChangedRes as { count: number | null }).count ?? 0;

  // Forfatter-opdateringer
  const authorUpdateEvents = (authorUpdateEventsRes.data ?? []) as { payload: Record<string, unknown> | null }[];
  const articlesUpdated = authorUpdateEvents.length;
  const totalMatchedA  = authorUpdateEvents.reduce((s, e) => s + ((e.payload?.scenario_a as number) ?? 0), 0);
  const totalCreatedB  = authorUpdateEvents.reduce((s, e) => s + ((e.payload?.scenario_b as number) ?? 0), 0);
  const totalRemovedC  = authorUpdateEvents.reduce((s, e) => s + ((e.payload?.scenario_c as number) ?? 0), 0);
  const totalUnmatched = authorUpdateEvents.reduce((s, e) => s + ((e.payload?.unmatched  as number) ?? 0), 0);

  // Circle table data
  const circleRows: {
    circle: 1 | 2 | 3;
    name: string;
    approved: number | null;
    pending: number | null;
    rejected: number | null;
    latestDate: string | null;
  }[] = [
    { circle: 1, name: "Trusted Journals", approved: c1Approved, pending: null, rejected: null, latestDate: latestC1?.started_at ?? null },
    { circle: 2, name: "Extended Sources", approved: c2Approved, pending: c2Pending, rejected: c2Rejected, latestDate: latestC2?.started_at ?? null },
    { circle: 3, name: "Danish Sources", approved: c3Approved || null, pending: c3Pending, rejected: c3Rejected || null, latestDate: latestC3?.started_at ?? null },
  ];

  const totalApproved = c1Approved + c2Approved + c3Approved;
  const totalPending = c2Pending + c3Pending;
  const totalRejected = c2Rejected + c3Rejected;

  // ── Render ──
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
            textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
          }}>
            System · Import
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Import oversigt</h1>
        </div>

        {/* ═══ SEKTION 1: ARTIKLER ═══ */}
        <SectionHeading title="Artikler" />
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Import-kilder</span>
          </div>

          <PeriodTable rows={[
            { label: "Importeret", today: articlesToday, week: articlesWeek, month: articlesMonth, year: articlesYear, total: totalArticles },
          ]} />

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Import-kilde", "Approved", "Pending", "Rejected", "Seneste import", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {circleRows.map((row) => (
                <tr key={row.circle}>
                  <td style={tdStyle}>
                    <CircleBadge circle={row.circle} />
                    <span style={{ fontWeight: 600 }}>{row.name}</span>
                  </td>
                  <td style={{ ...tdStyle, color: row.approved ? "#15803d" : "#888", fontWeight: row.approved ? 600 : 400 }}>
                    {dash(row.approved)}
                  </td>
                  <td style={{ ...tdStyle, color: row.pending ? "#d97706" : "#888", fontWeight: row.pending ? 600 : 400 }}>
                    {dash(row.pending)}
                  </td>
                  <td style={{ ...tdStyle, color: row.rejected ? "#b91c1c" : "#888", fontWeight: row.rejected ? 600 : 400 }}>
                    {dash(row.rejected)}
                  </td>
                  <td style={{ ...tdStyle, color: "#5a6a85", whiteSpace: "nowrap" }}>
                    {fmt(row.latestDate)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <Link
                      href={`/admin/system/import/c${row.circle}`}
                      style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", textDecoration: "none" }}
                    >
                      Administrér →
                    </Link>
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#15803d" }}>{num(totalApproved)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: totalPending > 0 ? "#d97706" : "#888" }}>{totalPending > 0 ? num(totalPending) : "—"}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: totalRejected > 0 ? "#b91c1c" : "#888" }}>{totalRejected > 0 ? num(totalRejected) : "—"}</td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
              </tr>
            </tbody>
          </table>

          {/* KPI under table */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid #eef0f4" }}>
            <div>
              <div style={kpiLabel}>Total artikler</div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#E83B2A" }}>{num(totalArticles)}</div>
            </div>
          </div>
        </div>

        {/* ═══ SEKTION 2: FORFATTERE ═══ */}
        <SectionHeading title="Forfattere" />
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Forfatter-berigelse</span>
            <Link
              href="/admin/system/author-linking"
              style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", textDecoration: "none" }}
            >
              Administrér →
            </Link>
          </div>

          <PeriodTable rows={[
            { label: "Linket",           today: authorsToday, week: authorsWeek, month: authorsMonth, year: authorsYear, total: authorsTotal },
            { label: "OpenAlex",         today: openalexToday, week: openalexWeek, month: openalexMonth, year: openalexYear, total: openalexTotal },
            { label: "Geo-uverificeret", today: uverToday, week: uverWeek, month: uverMonth, year: uverYear, total: uverTotal },
          ]} />

          <div style={{ padding: "12px 24px", borderTop: "1px solid #eef0f4", display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <ReparseAuthorGeoButton />
            <ParseArticleLocationsButton />
          </div>

          <div style={{ padding: "20px 24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              { label: "Artikler uden forfattere", value: unlinkedArticles, color: "#ea580c" },
              { label: "Afventer", value: unlinkedAuthorSlots, color: "#1a1a1a" },
              { label: "Forfattere i DB", value: totalAuthors, color: "#1a1a1a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                padding: "16px 20px", flex: 1, minWidth: 130,
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                  {num(value)}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{label}</div>
              </div>
            ))}
            <div style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
              padding: "16px 20px", flex: 1, minWidth: 130,
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.02em" }}>
                {latestLinkingRun}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Seneste kørsel</div>
            </div>
          </div>
        </div>

        {/* ═══ SEKTION 3: PUBMED SYNC ═══ */}
        <SectionHeading title="PubMed Sync" />
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Seneste kørsel</span>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>{fmtSyncRun(lastSyncedAt)}</span>
              <Link
                href="/admin/system/import/pubmed-sync"
                style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", textDecoration: "none" }}
              >
                Administrér →
              </Link>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", padding: "20px" }}>
            {[
              { label: "Importeret", value: lastRunImported,  color: "#1a1a1a" },
              { label: "Opdateret",  value: lastRunUpdated,   color: "#1a1a1a" },
              { label: "Retracted",  value: lastRunRetracted, color: lastRunRetracted > 0 ? "#dc2626" : "#1a1a1a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#f8f9fb", borderRadius: "8px", padding: "16px 18px" }}>
                <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>{label}</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color }}>{num(value)}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #eef0f4", padding: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              { label: "Aldrig synket",   value: neverSynced,    color: neverSynced > 0 ? "#d97706" : "#1a1a1a" },
              { label: "Retracted i DB",  value: retractedTotal, color: retractedTotal > 0 ? "#dc2626" : "#1a1a1a" },
              { label: "Authors changed", value: authorsChanged, color: authorsChanged > 0 ? "#ea580c" : "#1a1a1a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{num(value)}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ SEKTION 4: FORFATTER-OPDATERINGER ═══ */}
        <SectionHeading title="Forfatter-opdateringer" />
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Authors changed pipeline</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", padding: "20px" }}>
            {[
              { label: "Artikler opdateret",          value: articlesUpdated, color: "#1a1a1a" },
              { label: "Authors changed (afventer)",  value: authorsChanged,  color: authorsChanged  > 0 ? "#ea580c" : "#1a1a1a" },
              { label: "Ikke matchet",                value: totalUnmatched,  color: totalUnmatched  > 0 ? "#d97706" : "#1a1a1a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#f8f9fb", borderRadius: "8px", padding: "16px 18px" }}>
                <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>{label}</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color }}>{num(value)}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #eef0f4", padding: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              { label: "Matchet (A)",  value: totalMatchedA, color: "#15803d" },
              { label: "Oprettet (B)", value: totalCreatedB, color: "#1a1a1a" },
              { label: "Fjernet (C)",  value: totalRemovedC, color: totalRemovedC > 0 ? "#dc2626" : "#1a1a1a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{num(value)}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
