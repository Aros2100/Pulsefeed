import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { ScoringClient } from "./ScoringClient";

export const dynamic = "force-dynamic";

const sectionCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "24px",
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
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "#5a6a85",
};

type ModelVersion = { specialty: string; module: string; version: string };

type ScoringRun = {
  id: string;
  module: string;
  specialty: string;
  version: string;
  started_at: string;
  finished_at: string | null;
  scored: number;
  failed: number;
  total: number;
  status: string;
  error: string | null;
  triggered_by: string;
};

function fmtDa(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem  = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

const MODULE_CONFIG: Record<string, {
  label: string;
  apiRoute: string;
  requestBody: (specialty: string) => Record<string, unknown>;
  showLimit?: boolean;
}> = {
  specialty: {
    label: "Specialty",
    apiRoute: "/api/scoring/score-specialty",
    requestBody: (specialty) => ({ specialty }),
  },
  subspecialty: {
    label: "Subspecialty",
    apiRoute: "/api/scoring/score-subspecialty",
    requestBody: (specialty) => ({ specialty }),
  },
  article_type_prod: {
    label: "Article Type",
    apiRoute: "/api/scoring/score-article-type",
    requestBody: (specialty) => ({ specialty }),
  },
  condensation_text: {
    label: "Text Condensation",
    apiRoute: "/api/scoring/score-condensation-text",
    requestBody: (specialty) => ({ specialty }),
  },
  condensation_sari: {
    label: "SARI Condensation",
    apiRoute: "/api/scoring/score-condensation-sari",
    requestBody: (specialty) => ({ specialty }),
  },
};

export default async function ScoringPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const specialty = ACTIVE_SPECIALTY;

  const { data: allModules } = await admin
    .from("model_versions")
    .select("specialty, module, version")
    .eq("active", true)
    .in("module", ["specialty", "subspecialty", "article_type_prod", "condensation_text", "condensation_sari"]);

  const rows: ModelVersion[] = allModules ?? [];

  // Fetch pending counts in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runsRaw } = await (admin as any).rpc("get_scoring_runs", { p_limit: 20 });
  const scoringRuns: ScoringRun[] = runsRaw ?? [];

  const pendingCounts = await Promise.all(
    rows.map(async ({ module: mod }) => {
      if (mod === "specialty") {
        const { count } = await admin
          .from("article_specialties")
          .select("*", { count: "exact", head: true })
          .eq("specialty", specialty)
          .eq("source", "c2_filter")
          .is("specialty_match", null);
        return [mod, count ?? 0] as const;
      }
      if (mod === "subspecialty") {
        const { data } = await admin.rpc("count_subspecialty_unscored", { p_specialty: specialty });
        return [mod, (data as number | null) ?? 0] as const;
      }
      if (mod === "condensation_text") {
        const { data } = await admin.rpc("count_text_unscored", { p_specialty: specialty });
        return [mod, (data as number | null) ?? 0] as const;
      }
      if (mod === "condensation_sari") {
        const { data } = await admin.rpc("count_sari_unscored", { p_specialty: specialty });
        return [mod, (data as number | null) ?? 0] as const;
      }
      // article_type_prod
      const { data } = await admin.rpc("count_article_type_unscored", { p_specialty: specialty });
      return [mod, (data as number | null) ?? 0] as const;
    })
  );
  const pendingByModule = Object.fromEntries(pendingCounts);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px 80px" }}>

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
            System · Scoring
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Scoring</h1>
            <Link href="/admin/system/scoring/batches" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
              → Batches
            </Link>
          </div>
        </div>

        {rows.length === 0 && (
          <p style={{ fontSize: "14px", color: "#5a6a85" }}>Ingen aktive scoring-moduler fundet.</p>
        )}

        {rows.map(({ specialty: rowSpecialty, module: mod, version }) => {
          const cfg = MODULE_CONFIG[mod];
          if (!cfg) return null;
          const pending = pendingByModule[mod] ?? 0;
          return (
            <div key={`${rowSpecialty}-${mod}`} style={sectionCard}>
              <div style={sectionHeader}>
                <div>
                  <span style={headerLabel}>{cfg.label}</span>
                  <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>
                    {rowSpecialty}
                  </span>
                  <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888" }}>{version}</span>
                </div>
                <span style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: pending > 0 ? "#d97706" : "#15803d",
                  background: pending > 0 ? "#fef9c3" : "#dcfce7",
                  borderRadius: "20px",
                  padding: "2px 10px",
                }}>
                  {pending.toLocaleString("da-DK")} pending
                </span>
              </div>

              <ScoringClient
                specialty={rowSpecialty}
                module={mod}
                version={version}
                pendingCount={pending}
                apiRoute={cfg.apiRoute}
                requestBody={cfg.requestBody(rowSpecialty)}
                showLimit={cfg.showLimit}
              />
            </div>
          );
        })}

        {/* Scoring log */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Scoring log</span>
            <span style={{ fontSize: "12px", color: "#888" }}>Seneste 20 kørsler</span>
          </div>
          {scoringRuns.length === 0 ? (
            <div style={{ padding: "24px 20px", fontSize: "13px", color: "#888" }}>Ingen kørsler endnu.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #dde3ed" }}>
                    {["Modul", "Specialty", "Version", "Startet", "Varighed", "Scored / Failed", "Status", "Af"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontWeight: 700, fontSize: "11px", letterSpacing: "0.05em", textTransform: "uppercase", color: "#5a6a85", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scoringRuns.map((run, i) => {
                    const statusColor = run.status === "done" ? "#15803d" : run.status === "error" ? "#b91c1c" : "#d97706";
                    const statusBg    = run.status === "done" ? "#dcfce7"  : run.status === "error" ? "#fee2e2"  : "#fef9c3";
                    return (
                      <tr key={run.id} style={{ borderBottom: "1px solid #f1f3f7", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ padding: "9px 14px", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap" }}>{run.module}</td>
                        <td style={{ padding: "9px 14px", color: "#444", textTransform: "capitalize" }}>{run.specialty}</td>
                        <td style={{ padding: "9px 14px", color: "#888", fontFamily: "monospace" }}>{run.version}</td>
                        <td style={{ padding: "9px 14px", color: "#5a6a85", whiteSpace: "nowrap" }}>{fmtDa(run.started_at)}</td>
                        <td style={{ padding: "9px 14px", color: "#888", whiteSpace: "nowrap" }}>{fmtDuration(run.started_at, run.finished_at)}</td>
                        <td style={{ padding: "9px 14px", color: run.failed > 0 ? "#b91c1c" : "#444" }}>
                          {run.scored} / {run.failed > 0 ? <span style={{ color: "#b91c1c", fontWeight: 700 }}>{run.failed}</span> : run.failed}
                        </td>
                        <td style={{ padding: "9px 14px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: statusColor, background: statusBg, borderRadius: "20px", padding: "2px 10px" }}>
                            {run.status}
                          </span>
                          {run.error && <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "2px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={run.error}>{run.error}</div>}
                        </td>
                        <td style={{ padding: "9px 14px", color: "#aaa" }}>{run.triggered_by}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
