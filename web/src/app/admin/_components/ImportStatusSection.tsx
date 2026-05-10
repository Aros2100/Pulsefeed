import Link from "next/link";
import { fetchNightlyFlowReport } from "@/app/admin/system/nightly-flow/_lib/fetchReport";
import type { NightlyFlowReport, BoxStatus, ComponentBox } from "@/app/admin/system/nightly-flow/_lib/types";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

function lastNightDate(): string {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0));
  const target = now < cutoff ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  return target.toISOString().slice(0, 10);
}

type Phase = { name: string; status: "ok" | "warn" | "error" | "missing" };
type CardStatus = "ok" | "warn" | "error" | "missing";

function phaseStatus(boxes: ComponentBox[]): Phase["status"] {
  if (boxes.some(b => b.status === "error")) return "error";
  if (boxes.some(b => b.status === "warn")) return "warn";
  if (boxes.length > 0 && boxes.every(b => b.status === "missing")) return "missing";
  return "ok";
}

function buildPhases(r: NightlyFlowReport): Phase["status"][] {
  return [
    phaseStatus([r.tier1_import_circles.import_c1, r.tier1_import_circles.import_c2, r.tier1_import_circles.import_c4, r.tier1_combined.daily_import]),
    phaseStatus([r.tier2_sync_authorlink.daily_pubmed_sync, r.tier2_sync_authorlink.trigger_author_linking]),
    phaseStatus([r.tier3_autotag_authorupdate.auto_tag_specialty, r.tier3_autotag_authorupdate.daily_author_update, r.tier5_autotag_articletype.auto_tag_article_type]),
    phaseStatus([r.tier4_specialty_scoring.specialty_new, r.tier4_specialty_scoring.specialty_rescore]),
    phaseStatus(Object.values(r.tier6_scoring_swarm) as ComponentBox[]),
    phaseStatus([r.tier7_sari.sari_new, r.tier7_sari.sari_rescore]),
    phaseStatus([r.tier9_background.scoring_batch_poll, r.tier9_background.scoring_batch_ingest]),
  ];
}

function worstStatus(statuses: Phase["status"][]): CardStatus {
  if (statuses.some(s => s === "error")) return "error";
  if (statuses.some(s => s === "warn")) return "warn";
  if (statuses.every(s => s === "missing")) return "missing";
  return "ok";
}

const CARD_BG: Record<CardStatus, string>     = { ok: "#F0FDF4", warn: "#FFFBEB", error: "#FEF2F2", missing: "#F9FAFB" };
const CARD_BORDER: Record<CardStatus, string> = { ok: "#86EFAC", warn: "#FCD34D", error: "#FCA5A5", missing: "#E2E8F0" };
const CARD_TEXT: Record<CardStatus, string>   = { ok: "#14532D", warn: "#78350F", error: "#7F1D1D", missing: "#6B7280" };
const STATUS_ICON: Record<CardStatus, string> = { ok: "✅", warn: "⚠️", error: "❌", missing: "—" };

function mainLine(status: CardStatus, inSpecialty: number, warnCount: number, errorCount: number): string {
  const label = `${inSpecialty} new ${ACTIVE_SPECIALTY} articles`;
  switch (status) {
    case "ok":      return `${label} · ran cleanly`;
    case "warn":    return `${label} · ${warnCount} warning${warnCount === 1 ? "" : "s"}`;
    case "error":   return `${label} · ${errorCount} error${errorCount === 1 ? "" : "s"}`;
    case "missing": return "Last night did not run";
  }
}

export async function ImportStatusSection() {
  const date = lastNightDate();
  const report = await fetchNightlyFlowReport(date);
  const statuses = buildPhases(report);
  const status = worstStatus(statuses);
  const imported = (report.tier8_result.ready_by_morning.details.in_specialty as number) ?? 0;
  const windowTime = report.window_start.slice(11, 16) + " UTC";

  return (
    <Link href={`/admin/system/nightly-flow?date=${date}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: CARD_BG[status],
        border: `1px solid ${CARD_BORDER[status]}`,
        borderRadius: "10px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "92px",
        color: CARD_TEXT[status],
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px", opacity: 0.75 }}>
          Last night&apos;s import
        </div>
        <div style={{ fontSize: "15px", fontWeight: 700, lineHeight: 1.2, marginBottom: "4px" }}>
          {STATUS_ICON[status]} {mainLine(status, imported, report.summary.warn_count, report.summary.error_count)}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", opacity: 0.65 }}>{windowTime}</span>
          <span style={{ fontSize: "12px", fontWeight: 600, opacity: 0.85 }}>See full report →</span>
        </div>
      </div>
    </Link>
  );
}
