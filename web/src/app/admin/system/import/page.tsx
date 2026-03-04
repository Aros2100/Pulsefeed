import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import ImportDashboardActions from "./ImportDashboardActions";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatRow = { circle: number | null; status: string | null; antal: number };

interface QualityCheck {
  id: string;
  import_log_id: string | null;
  check_type: string;
  passed: boolean;
  total_checks: number;
  failed_checks: number;
  created_at: string;
}

interface LinkingSnap {
  started_at: string;
  completed_at: string | null;
  status: string;
  new_authors: number | null;
  duplicates: number | null;
  rejected: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function n(v: number) { return v.toLocaleString("da-DK"); }

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
};

const cardHeader = (accent = false): React.CSSProperties => ({
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: accent ? "#E83B2A" : "#5a6a85",
});

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ImportDashboardPage() {
  const admin = createAdminClient();
  const activeSpecialties = SPECIALTIES.filter((s) => s.active);

  // All fetches in one parallel batch
  const [
    rpcResults,
    authorsResult,
    qualityChecksResult,
    latestLinkingResult,
  ] = await Promise.all([
    Promise.all(
      activeSpecialties.map((s) =>
        admin
          .rpc("get_specialty_article_stats" as never, { specialty_slug: s.slug } as never)
          .then((r) => (r.data as unknown as StatRow[]) ?? [])
      )
    ),
    admin.from("authors").select("*", { count: "exact", head: true }),
    (admin as unknown as Record<string, (t: string) => {
      select: (c: string) => { order: (f: string, o: object) => { limit: (n: number) => Promise<{ data: unknown[] | null }> } }
    }>).from("import_quality_checks")
      .select("id, import_log_id, check_type, passed, total_checks, failed_checks, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
    admin
      .from("author_linking_logs")
      .select("started_at, completed_at, status, new_authors, duplicates, rejected")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // ── Compute specialty stats ────────────────────────────────────────────────
  const specialtyStats = activeSpecialties.map((spec, i) => {
    const rows = rpcResults[i];
    function get(c: number, s: string) {
      return Number(rows.find((r) => r.circle === c && r.status === s)?.antal ?? 0);
    }
    const c1Approved = get(1, "approved");
    const c2Approved = get(2, "approved");
    const c2Pending  = get(2, "pending");
    const c2Rejected = get(2, "rejected") + get(3, "rejected");
    const total      = rows.reduce((sum, r) => sum + Number(r.antal), 0);
    return { spec, c1Approved, c2Approved, c2Pending, c2Rejected, total };
  });

  const agg = {
    total:      specialtyStats.reduce((sum, s) => sum + s.total, 0),
    c1:         specialtyStats.reduce((sum, s) => sum + s.c1Approved, 0),
    c2Approved: specialtyStats.reduce((sum, s) => sum + s.c2Approved, 0),
    c2Pending:  specialtyStats.reduce((sum, s) => sum + s.c2Pending, 0),
    c2Rejected: specialtyStats.reduce((sum, s) => sum + s.c2Rejected, 0),
  };

  const totalAuthors   = authorsResult.count ?? 0;
  const latestLinking  = latestLinkingResult.data as LinkingSnap | null;
  const qualityChecks  = ((qualityChecksResult as { data: unknown[] | null }).data ?? []) as QualityCheck[];
  const specialtySlugs = activeSpecialties.map((s) => s.slug);

  const statBuckets = [
    { label: "C1 Approved", value: agg.c1,         bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d" },
    { label: "C2 Approved", value: agg.c2Approved, bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d" },
    { label: "C2 Afventer", value: agg.c2Pending,  bg: "#fffbeb", border: "#fde68a", color: "#d97706" },
    { label: "C2 Afvist",   value: agg.c2Rejected, bg: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
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
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Import Dashboard</h1>
        </div>

        {/* ═══════════════════════════════ */}
        {/* SEKTION 1: ARTIKLER            */}
        {/* ═══════════════════════════════ */}
        <SectionHeading title="Artikler" />
        <div style={{ ...card, marginBottom: "40px" }}>
          <div style={{ padding: "24px 28px" }}>

            {/* Stats row */}
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "20px" }}>
              {/* Total */}
              <div style={{ marginRight: "8px" }}>
                <div style={{
                  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "#5a6a85", marginBottom: "4px",
                }}>
                  Total
                </div>
                <div style={{ fontSize: "40px", fontWeight: 800, lineHeight: 1, color: "#E83B2A" }}>
                  {n(agg.total)}
                </div>
              </div>

              {/* Separator */}
              <div style={{ width: "1px", background: "#e5e7eb", alignSelf: "stretch", margin: "0 8px" }} />

              {/* Buckets */}
              {statBuckets.map(({ label, value, bg, border, color }) => (
                <div key={label} style={{
                  background: bg, border: `1px solid ${border}`,
                  borderRadius: "8px", padding: "10px 14px", textAlign: "center",
                }}>
                  <div style={{
                    fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.05em", color, marginBottom: "4px",
                  }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color }}>{n(value)}</div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ borderTop: "1px solid #f1f3f7", paddingTop: "16px" }}>
              <ImportDashboardActions specialtySlugs={specialtySlugs} subset="articles" />
            </div>

          </div>
        </div>

        {/* ═══════════════════════════════ */}
        {/* SEKTION 2: FORFATTERE          */}
        {/* ═══════════════════════════════ */}
        <SectionHeading title="Forfattere" />

        <div style={{ ...card, marginBottom: "40px" }}>
          <div style={{ padding: "28px 32px", display: "flex", alignItems: "center", gap: "40px", flexWrap: "wrap" }}>
            {/* Total */}
            <div style={{ flexShrink: 0 }}>
              <div style={{
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "#5a6a85", marginBottom: "8px",
              }}>
                Forfattere i DB
              </div>
              <div style={{ fontSize: "52px", fontWeight: 800, lineHeight: 1, color: "#E83B2A" }}>
                {n(totalAuthors)}
              </div>
              {latestLinking && (
                <div style={{ fontSize: "12px", color: "#888", marginTop: "8px" }}>
                  Seneste linking: {fmt(latestLinking.started_at)}
                </div>
              )}
            </div>

            {/* Stats from latest completed linking run */}
            <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
              {[
                { label: "Nye",       value: latestLinking?.new_authors, color: "#15803d", icon: "✅" },
                { label: "Dubletter", value: latestLinking?.duplicates,  color: "#1d4ed8", icon: "🔄" },
                { label: "Afvist",    value: latestLinking?.rejected,    color: "#d97706", icon: "❌" },
              ].map(({ label, value, color, icon }) => (
                <div key={label}>
                  <div style={{ fontSize: "12px", color: "#5a6a85", marginBottom: "4px" }}>
                    {label} {icon}
                  </div>
                  <div style={{ fontSize: "32px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>
                    {value != null ? n(value) : "—"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#bbb", marginTop: "2px" }}>seneste kørsel</div>
                </div>
              ))}
            </div>

            <div style={{ marginLeft: "auto" }}>
              <Link
                href="/admin/system/author-linking"
                style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", textDecoration: "none" }}
              >
                Detaljer →
              </Link>
            </div>
          </div>

          {/* Linking action */}
          <div style={{ borderTop: "1px solid #f1f3f7", padding: "16px 28px" }}>
            <ImportDashboardActions specialtySlugs={specialtySlugs} subset="linking" />
          </div>
        </div>

        {/* ═══════════════════════════════ */}
        {/* SEKTION 3: KONFIGURATION       */}
        {/* ═══════════════════════════════ */}
        <SectionHeading title="Konfiguration" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", marginBottom: "40px" }}>
          {[
            {
              title: "C1 Filtre",
              desc: "PubMed-filtre for Circle 1 — trusted journals og søgestrenge",
              href: `/admin/system/layers/neurosurgery?tab=circle1`,
            },
            {
              title: "C2 Affiliations",
              desc: "Affilierings-søgninger for Circle 2 — extended sources",
              href: `/admin/system/layers/neurosurgery?tab=circle2`,
            },
          ].map(({ title, desc, href }) => (
            <Link
              key={title}
              href={href}
              style={{ ...card, textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div style={cardHeader()}>
                {title}
              </div>
              <div style={{ padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ fontSize: "13px", color: "#5a6a85", lineHeight: 1.5 }}>{desc}</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", flexShrink: 0 }}>Konfigurér →</div>
              </div>
            </Link>
          ))}
        </div>

        {/* ═══════════════════════════════ */}
        {/* SEKTION 4: QUALITY CHECKS      */}
        {/* ═══════════════════════════════ */}
        <SectionHeading title="Quality checks" />
        <div style={card}>
          <div style={cardHeader()}>Seneste 3 kørsler</div>
          {qualityChecks.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Ingen quality checks fundet
            </div>
          ) : (
            qualityChecks.map((qc, i) => (
              <div key={qc.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 20px",
                borderTop: i === 0 ? undefined : "1px solid #f1f3f7",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: "999px",
                    fontSize: "11px", fontWeight: 600,
                    background: qc.passed ? "#f0fdf4" : "#fef2f2",
                    color:      qc.passed ? "#15803d" : "#b91c1c",
                    border:    `1px solid ${qc.passed ? "#bbf7d0" : "#fecaca"}`,
                  }}>
                    {qc.passed ? "✓ Passed" : "✗ Failed"}
                  </span>
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: "999px",
                    fontSize: "11px", fontWeight: 600,
                    background: qc.check_type === "article" ? "#eff6ff" : "#f5f3ff",
                    color:      qc.check_type === "article" ? "#1d4ed8" : "#6d28d9",
                    border:    `1px solid ${qc.check_type === "article" ? "#bfdbfe" : "#ddd6fe"}`,
                  }}>
                    {qc.check_type}
                  </span>
                  <span style={{ fontSize: "12px", color: qc.passed ? "#888" : "#b91c1c" }}>
                    {qc.passed
                      ? `${qc.total_checks} checks passed`
                      : `${qc.failed_checks} / ${qc.total_checks} checks fejlede`
                    }
                  </span>
                </div>
                <span style={{ fontSize: "12px", color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {fmt(qc.created_at)}
                </span>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
