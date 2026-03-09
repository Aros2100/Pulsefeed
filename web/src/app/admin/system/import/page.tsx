import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkingSnap {
  started_at: string;
  completed_at: string | null;
  status: string;
  new_authors: number | null;
  duplicates: number | null;
  rejected: number | null;
}

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

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ background: "#eef0f4", borderRadius: "6px", height: "8px", overflow: "hidden", width: "100%" }}>
      <div style={{ background: color, height: "100%", borderRadius: "6px", width: `${pct}%`, transition: "width 0.3s" }} />
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
    authorsResult, unlinkedResult, latestLinkingResult,
    citWithRes, citWithoutRes, ifWithRes, ifWithoutRes,
    latestC1LogResult, latestC2LogResult, latestC3LogResult,
  ] = await Promise.all([
    // Article counts per circle+status
    countQ(1, "approved"), countQ(2, "approved"), countQ(2, "pending"), countQ(2, "rejected"),
    countQ(3, "approved"), countQ(3, "pending"), countQ(3, "rejected"),
    // Total articles
    admin.from("articles").select("id", { count: "exact", head: true }),
    // Authors
    admin.from("authors").select("*", { count: "exact", head: true }),
    admin.rpc("count_unlinked_articles" as never),
    admin.from("author_linking_logs")
      .select("started_at, completed_at, status, new_authors, duplicates, rejected")
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
    // Enrichment
    admin.from("articles").select("id", { count: "exact", head: true }).not("citation_count" as never, "is", null),
    admin.from("articles").select("id", { count: "exact", head: true }).is("citation_count" as never, null),
    admin.from("articles").select("id", { count: "exact", head: true }).not("impact_factor", "is", null),
    admin.from("articles").select("id", { count: "exact", head: true }).is("impact_factor", null),
    // Latest completed import log per circle
    admin.from("pubmed_filters").select("id").eq("specialty", "neurosurgery").eq("circle", 1)
      .then(async (fRes: { data: { id: string }[] | null }) => {
        const ids = (fRes.data ?? []).map((f) => f.id);
        if (ids.length === 0) return { data: null };
        return admin.from("import_logs").select("started_at, articles_imported")
          .eq("status", "completed").in("filter_id", ids)
          .order("started_at", { ascending: false }).limit(1).maybeSingle();
      }),
    admin.from("pubmed_filters").select("id").eq("specialty", "neurosurgery").eq("circle", 2)
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
  const latestLinking = latestLinkingResult.data as LinkingSnap | null;

  // Enrichment stats
  const citWith = citWithRes.count ?? 0;
  const citWithout = citWithoutRes.count ?? 0;
  const citTotal = citWith + citWithout;

  const ifWith = ifWithRes.count ?? 0;
  const ifWithout = ifWithoutRes.count ?? 0;
  const ifTotal = ifWith + ifWithout;

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
          <Link href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Admin
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
            <span style={headerLabel}>Forfatter-linking</span>
            <Link
              href="/admin/system/author-linking"
              style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", textDecoration: "none" }}
            >
              Administrér →
            </Link>
          </div>
          <div style={{ padding: "20px 24px", display: "flex", gap: "40px", flexWrap: "wrap", alignItems: "flex-end" }}>
            {[
              { label: "Forfattere i DB", value: totalAuthors, color: "#E83B2A", large: true },
              { label: "Artikler uden forfattere", value: unlinkedArticles, color: "#d97706", large: false },
              { label: "Nye (seneste kørsel)", value: latestLinking?.new_authors ?? null, color: "#15803d", large: false },
              { label: "Dubletter", value: latestLinking?.duplicates ?? null, color: "#1d4ed8", large: false },
              { label: "Afviste", value: latestLinking?.rejected ?? null, color: "#d97706", large: false },
            ].map(({ label, value, color, large }) => (
              <div key={label}>
                <div style={kpiLabel}>{label}</div>
                <div style={{
                  fontSize: large ? "28px" : "20px", fontWeight: 800,
                  fontVariantNumeric: "tabular-nums", color,
                }}>
                  {value != null ? num(value) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ SEKTION 3: BERIGELSE ═══ */}
        <SectionHeading title="Berigelse" />
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Citations & Impact Factor</span>
          </div>
          <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
            {/* Citations */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>Citations</span>
                <span style={{ fontSize: "12px", color: "#5a6a85" }}>
                  {num(citWith)} / {num(citTotal)} artikler
                </span>
              </div>
              <ProgressBar value={citWith} total={citTotal} color="#1d4ed8" />
              <div style={{ fontSize: "12px", color: "#888", marginTop: "6px" }}>
                {citWithout > 0 ? `${num(citWithout)} mangler` : "Alle hentet"}
              </div>
            </div>

            {/* Impact Factor */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>Impact Factor</span>
                <span style={{ fontSize: "12px", color: "#5a6a85" }}>
                  {num(ifWith)} / {num(ifTotal)} artikler
                </span>
              </div>
              <ProgressBar value={ifWith} total={ifTotal} color="#7c3aed" />
              <div style={{ fontSize: "12px", color: "#888", marginTop: "6px" }}>
                {ifWithout > 0 ? `${num(ifWithout)} mangler` : "Alle hentet"}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
