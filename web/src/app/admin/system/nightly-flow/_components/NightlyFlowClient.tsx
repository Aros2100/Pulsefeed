"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NightlyFlowReport } from "../_lib/types";
import { HeaderSummary } from "./HeaderSummary";
import { FlowTier } from "./FlowTier";
import { ExpandedDetail } from "./ExpandedDetail";

export function NightlyFlowClient({
  initialDate,
  initialReport,
}: {
  initialDate: string;
  initialReport: NightlyFlowReport;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedBox, setExpandedBox] = useState<string | null>(null);

  const onDateChange = (newDate: string) => {
    startTransition(() => {
      router.push(`/admin/system/nightly-flow?date=${newDate}`);
    });
  };

  const onRefresh = () => {
    startTransition(() => router.refresh());
  };

  const r = initialReport;

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa", minHeight: "100vh", padding: "0",
    }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            Nightly Pipeline Flow
          </h1>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="date"
              value={initialDate}
              onChange={(e) => onDateChange(e.target.value)}
              style={{
                border: "1px solid #dde3ed", borderRadius: "6px",
                padding: "5px 10px", fontSize: "13px", fontFamily: "inherit",
                background: "#fff", cursor: "pointer",
              }}
            />
            <button
              onClick={onRefresh}
              disabled={isPending}
              style={{
                border: "1px solid #dde3ed", borderRadius: "6px",
                padding: "5px 12px", fontSize: "13px", fontFamily: "inherit",
                background: "#fff", cursor: isPending ? "default" : "pointer",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? "Refreshing…" : "↺ Refresh"}
            </button>
            <a
              href="/admin/system/nightly-status"
              style={{ fontSize: "12px", color: "#5a6a85", textDecoration: "none", marginLeft: "4px" }}
            >
              Raw status view →
            </a>
          </div>
        </div>

        {/* Header summary */}
        <HeaderSummary
          summary={r.summary}
          date={r.date}
          windowStart={r.window_start}
          windowEnd={r.window_end}
          irregularities={r.irregularities}
          onIrregularityClick={(component) => {
            document.getElementById(`box-${component}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />

        {/* ── Tier 1: Import circles ─────────────────────────────────────────── */}
        <FlowTier
          title="Article import"
          timeLabel="02:00"
          boxes={[
            { id: "import_c1", box: r.tier1_import_circles.import_c1, width: "third" },
            { id: "import_c2", box: r.tier1_import_circles.import_c2, width: "third" },
            { id: "import_c4", box: r.tier1_import_circles.import_c4, width: "third" },
          ]}
          onBoxClick={setExpandedBox}
        />

        {/* Convergence arrows → combined */}
        <FlowTier
          showConvergeArrows
          boxes={[
            { id: "daily_import", box: r.tier1_combined.daily_import, width: "full" },
          ]}
          showArrowDown
          onBoxClick={setExpandedBox}
        />

        {/* ── Tier 2: Sync & author linking ─────────────────────────────────── */}
        <FlowTier
          title="Sync & author linking"
          timeLabel="02:05"
          boxes={[
            { id: "daily_pubmed_sync",      box: r.tier2_sync_authorlink.daily_pubmed_sync,      width: "half" },
            { id: "trigger_author_linking", box: r.tier2_sync_authorlink.trigger_author_linking, width: "half" },
          ]}
          showArrowDown
          onBoxClick={setExpandedBox}
        />

        {/* ── Tier 3: Auto-tag specialty & author update ────────────────────── */}
        <FlowTier
          title="Rule-based specialty tagging & author update"
          timeLabel="02:10"
          boxes={[
            { id: "auto_tag_specialty", box: r.tier3_autotag_authorupdate.auto_tag_specialty, width: "half" },
            { id: "daily_author_update", box: r.tier3_autotag_authorupdate.daily_author_update, width: "half" },
          ]}
          showArrowDown
          onBoxClick={setExpandedBox}
        />

        {/* ── Tier 4: Specialty AI scoring ──────────────────────────────────── */}
        <FlowTier
          title="Specialty AI scoring"
          timeLabel="02:15"
          boxes={[
            { id: "specialty_new",    box: r.tier4_specialty_scoring.specialty_new,    width: "half" },
            { id: "specialty_rescore",box: r.tier4_specialty_scoring.specialty_rescore, width: "half" },
          ]}
          showArrowDown
          onBoxClick={setExpandedBox}
        />

        {/* ── Tier 5: Auto-tag article type ─────────────────────────────────── */}
        <FlowTier
          title="Rule-based article-type tagging"
          timeLabel="02:30"
          boxes={[
            { id: "auto_tag_article_type", box: r.tier5_autotag_articletype.auto_tag_article_type, width: "full" },
          ]}
          showArrowDown
          onBoxClick={setExpandedBox}
        />

        {/* ── Tier 6: Scoring swarm ─────────────────────────────────────────── */}
        <FlowTier
          title="Per-article AI scoring · 5 modules × new + rescore"
          timeLabel="02:50"
          boxes={[
            { id: "subspecialty_new",    box: r.tier6_scoring_swarm.subspecialty_new,    width: "half" },
            { id: "subspecialty_rescore",box: r.tier6_scoring_swarm.subspecialty_rescore, width: "half" },
          ]}
          onBoxClick={setExpandedBox}
        />
        <FlowTier
          boxes={[
            { id: "article_type_new",    box: r.tier6_scoring_swarm.article_type_new,    width: "half" },
            { id: "article_type_rescore",box: r.tier6_scoring_swarm.article_type_rescore, width: "half" },
          ]}
          onBoxClick={setExpandedBox}
        />
        <FlowTier
          boxes={[
            { id: "condensation_text_new",    box: r.tier6_scoring_swarm.condensation_text_new,    width: "half" },
            { id: "condensation_text_rescore",box: r.tier6_scoring_swarm.condensation_text_rescore, width: "half" },
          ]}
          onBoxClick={setExpandedBox}
        />
        <FlowTier
          boxes={[
            { id: "geo_class_a_new",    box: r.tier6_scoring_swarm.geo_class_a_new,    width: "half" },
            { id: "geo_class_a_rescore",box: r.tier6_scoring_swarm.geo_class_a_rescore, width: "half" },
          ]}
          onBoxClick={setExpandedBox}
        />
        <FlowTier
          boxes={[
            { id: "geo_class_b_new",    box: r.tier6_scoring_swarm.geo_class_b_new,    width: "half" },
            { id: "geo_class_b_rescore",box: r.tier6_scoring_swarm.geo_class_b_rescore, width: "half" },
          ]}
          showArrowDown
          onBoxClick={setExpandedBox}
        />

        {/* ── Tier 7: SARI ──────────────────────────────────────────────────── */}
        <FlowTier
          title="SARI extraction"
          timeLabel="03:30"
          boxes={[
            { id: "sari_new",    box: r.tier7_sari.sari_new,    width: "half" },
            { id: "sari_rescore",box: r.tier7_sari.sari_rescore, width: "half" },
          ]}
          showArrowDown
          onBoxClick={setExpandedBox}
        />

        {/* ── Tier 8: Result ────────────────────────────────────────────────── */}
        <FlowTier
          title="Ready by morning"
          boxes={[
            { id: "ready_by_morning", box: r.tier8_result.ready_by_morning, width: "full" },
          ]}
          onBoxClick={setExpandedBox}
        />

        {/* Separator */}
        <div style={{ borderTop: "0.5px solid #dde3ed", margin: "16px 0 12px" }} />

        {/* ── Tier 9: Background cron ───────────────────────────────────────── */}
        <FlowTier
          title="Background (every 5 min, 24/7)"
          boxes={[
            { id: "scoring_batch_poll",   box: r.tier9_background.scoring_batch_poll,   width: "half" },
            { id: "scoring_batch_ingest", box: r.tier9_background.scoring_batch_ingest, width: "half" },
          ]}
          onBoxClick={setExpandedBox}
        />

      </div>

      {/* Expanded detail panel */}
      {expandedBox && (
        <ExpandedDetail
          boxId={expandedBox}
          report={r}
          onClose={() => setExpandedBox(null)}
        />
      )}
    </div>
  );
}
