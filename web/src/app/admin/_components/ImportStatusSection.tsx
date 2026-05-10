import Link from "next/link";
import { fetchNightlyFlowReport } from "@/app/admin/system/nightly-flow/_lib/fetchReport";
import type { NightlyFlowReport, BoxStatus, ComponentBox } from "@/app/admin/system/nightly-flow/_lib/types";

function lastNightDate(): string {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0));
  const target = now < cutoff ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  return target.toISOString().slice(0, 10);
}

function fmtISODate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function fmtUTCTime(iso: string): string {
  return iso.slice(11, 16);
}

type Phase = { name: string; status: "ok" | "warn" | "error" | "missing" };
type CardStatus = "ok" | "warn" | "error" | "missing";

function phaseStatus(boxes: ComponentBox[]): Phase["status"] {
  if (boxes.some(b => b.status === "error")) return "error";
  if (boxes.some(b => b.status === "warn")) return "warn";
  if (boxes.length > 0 && boxes.every(b => b.status === "missing")) return "missing";
  return "ok"; // ok + expected_silent both collapse to green
}

function buildPhases(r: NightlyFlowReport): Phase[] {
  return [
    { name: "Import",       status: phaseStatus([r.tier1_import_circles.import_c1, r.tier1_import_circles.import_c2, r.tier1_import_circles.import_c4, r.tier1_combined.daily_import]) },
    { name: "Sync",         status: phaseStatus([r.tier2_sync_authorlink.daily_pubmed_sync, r.tier2_sync_authorlink.trigger_author_linking]) },
    { name: "Auto-tag",     status: phaseStatus([r.tier3_autotag_authorupdate.auto_tag_specialty, r.tier3_autotag_authorupdate.daily_author_update, r.tier5_autotag_articletype.auto_tag_article_type]) },
    { name: "Specialty AI", status: phaseStatus([r.tier4_specialty_scoring.specialty_new, r.tier4_specialty_scoring.specialty_rescore]) },
    { name: "Scoring swarm",status: phaseStatus(Object.values(r.tier6_scoring_swarm) as ComponentBox[]) },
    { name: "SARI",         status: phaseStatus([r.tier7_sari.sari_new, r.tier7_sari.sari_rescore]) },
    { name: "Background",   status: phaseStatus([r.tier9_background.scoring_batch_poll, r.tier9_background.scoring_batch_ingest]) },
  ];
}

function worstStatus(phases: Phase[]): CardStatus {
  if (phases.some(p => p.status === "error")) return "error";
  if (phases.some(p => p.status === "warn")) return "warn";
  if (phases.every(p => p.status === "missing")) return "missing";
  return "ok";
}

const PIP_COLOR: Record<Phase["status"], string> = {
  ok:      "#22C55E",
  warn:    "#F59E0B",
  error:   "#EF4444",
  missing: "#D1D5DB",
};

const CARD_BG: Record<CardStatus, string>     = { ok: "#F0FDF4", warn: "#FFFBEB", error: "#FEF2F2", missing: "#F9FAFB" };
const CARD_BORDER: Record<CardStatus, string> = { ok: "#86EFAC", warn: "#FCD34D", error: "#FCA5A5", missing: "#D1D5DB" };
const CARD_TEXT: Record<CardStatus, string>   = { ok: "#14532D", warn: "#78350F", error: "#7F1D1D", missing: "#6B7280" };

const STATUS_ICON: Record<CardStatus, string> = { ok: "✅", warn: "⚠️", error: "❌", missing: "—" };

function headlineText(status: CardStatus, imported: number, warnCount: number, errorCount: number): string {
  switch (status) {
    case "ok":      return `Last night ran cleanly · ${imported} articles imported`;
    case "warn":    return `${imported} articles imported · ${warnCount} warning${warnCount === 1 ? "" : "s"} to check`;
    case "error":   return `${imported} articles imported · ${errorCount} error${errorCount === 1 ? "" : "s"}`;
    case "missing": return "Last night did not run";
  }
}

export async function ImportStatusSection() {
  const date = lastNightDate();
  const report = await fetchNightlyFlowReport(date);
  const phases = buildPhases(report);
  const status = worstStatus(phases);

  const imported = (report.tier1_combined.daily_import.details.total_imported as number) ?? 0;
  const headline = headlineText(status, imported, report.summary.warn_count, report.summary.error_count);
  const leftPhases = phases.slice(0, 4);
  const rightPhases = phases.slice(4);

  return (
    <div style={{ marginBottom: "28px" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", marginBottom: "2px" }}>
            Last night&apos;s import
          </div>
          <div style={{ fontSize: "11px", color: "#5a6a85" }}>
            {fmtISODate(date)}
            {" · "}
            <Link href={`/admin/system/nightly-flow?date=${date}`} style={{ color: "#3B82F6", textDecoration: "none" }}>
              click for full report
            </Link>
          </div>
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: CARD_BG[status],
        border: `1px solid ${CARD_BORDER[status]}`,
        borderRadius: "10px",
        padding: "16px 20px",
        color: CARD_TEXT[status],
      }}>
        {/* Headline */}
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
          {STATUS_ICON[status]} {headline}
        </div>

        {/* Window line */}
        <div style={{ fontSize: "11px", opacity: 0.75, marginBottom: "14px" }}>
          {fmtUTCTime(report.window_start)} → {fmtUTCTime(report.window_end)} UTC
        </div>

        {/* Phase pips — two rows */}
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: report.irregularities.length > 0 ? "12px" : "8px" }}>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {leftPhases.map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  display: "inline-block", width: "10px", height: "10px",
                  borderRadius: "50%", background: PIP_COLOR[p.status],
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: "11px", fontWeight: 500 }}>{p.name}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {rightPhases.map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  display: "inline-block", width: "10px", height: "10px",
                  borderRadius: "50%", background: PIP_COLOR[p.status],
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: "11px", fontWeight: 500 }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Irregularities */}
        {report.irregularities.length > 0 && (
          <div style={{ borderTop: `0.5px solid ${CARD_BORDER[status]}`, paddingTop: "10px", marginBottom: "10px" }}>
            {report.irregularities.slice(0, 3).map((ir, i) => (
              <div key={i} style={{ fontSize: "11px", marginBottom: "3px" }}>
                {ir.severity === "error" ? "❌" : "⚠️"} {ir.component} — {ir.message}
              </div>
            ))}
            {report.irregularities.length > 3 && (
              <div style={{ fontSize: "10px", opacity: 0.7 }}>
                +{report.irregularities.length - 3} more — see full report
              </div>
            )}
          </div>
        )}

        {/* Footer link */}
        <div style={{ textAlign: "right" }}>
          <Link href={`/admin/system/nightly-flow?date=${date}`} style={{ fontSize: "12px", color: "#3B82F6", textDecoration: "none", fontWeight: 500 }}>
            See full report →
          </Link>
        </div>
      </div>
    </div>
  );
}
