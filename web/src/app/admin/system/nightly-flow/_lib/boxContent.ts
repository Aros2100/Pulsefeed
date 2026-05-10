import type { ComponentBox } from "./types";
import { fmtDuration, latencyLine, nullStr } from "./format";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export type BoxContent = {
  explanation: string;
  counts: string;
  extra: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function d(box: ComponentBox): any { return box.details; }

export function getBoxContent(id: string, box: ComponentBox): BoxContent {
  const lat = d(box).latency as Parameters<typeof latencyLine>[0];

  switch (id) {
    case "import_c1": return {
      explanation: "specialty journals (reldate=2)",
      counts: `${d(box).fetched} fetched · ${d(box).imported} imported${d(box).skipped > 0 ? ` · ${d(box).skipped} skip` : ""}`,
      extra: box.timing ? fmtDuration(box.timing.duration_sec) : "",
    };
    case "import_c2": return {
      explanation: "key institutions (reldate=2)",
      counts: `${d(box).fetched} fetched · ${d(box).imported} imported${d(box).skipped > 0 ? ` · ${d(box).skipped} skip` : ""}`,
      extra: box.timing ? fmtDuration(box.timing.duration_sec) : "",
    };
    case "import_c4": return {
      explanation: "key MeSH terms (reldate=2)",
      counts: `${d(box).fetched} fetched · ${d(box).imported} imported${d(box).skipped > 0 ? ` · ${d(box).skipped} skip` : ""}`,
      extra: box.timing ? fmtDuration(box.timing.duration_sec) : "",
    };
    case "daily_import": return {
      explanation: "aggregated outcome from all import circles",
      counts: `${d(box).circles_succeeded}/${d(box).circles_total} circles · ${d(box).total_imported} imported`,
      extra: "",
    };
    case "daily_pubmed_sync": return {
      explanation: "pull updates from PubMed",
      counts: `${d(box).events_total} events · ${d(box).events_updated} updated · ${d(box).events_retracted} retracted`,
      extra: Array.isArray(d(box).meaningful_fields_changed) && (d(box).meaningful_fields_changed as { field: string; count: number }[]).length > 0
        ? (d(box).meaningful_fields_changed as { field: string; count: number }[]).map(f => `${f.field === "pmc_id" ? "full text access" : f.field} (${f.count})`).join(" · ")
        : "",
    };
    case "trigger_author_linking": return {
      explanation: "match author slots to author DB",
      counts: `${d(box).articles_processed} articles · ${d(box).authors_processed} slots`,
      extra: `${d(box).authors_linked} linked · ${d(box).new_authors} new · ${d(box).duplicates} dup · ${d(box).rejected} rejected`,
    };
    case "auto_tag_specialty": return {
      explanation: "deterministic pre-filter before AI",
      counts: `${d(box).approved} approved`,
      extra: "",
    };
    case "daily_author_update": return {
      explanation: "refresh authors in author database",
      counts: `${d(box).processed} articles · ${d(box).scenario_a} matched · ${d(box).scenario_b} new · ${d(box).scenario_c} removed`,
      extra: d(box).unmatched > 0 ? `${d(box).unmatched} unmatched` : "",
    };
    case "specialty_new": return {
      explanation: "is article in our specialty?",
      counts: `${d(box).scored} scored · ${d(box).failed} failed${d(box).approved !== undefined ? ` · ${d(box).approved} in ${ACTIVE_SPECIALTY} · ${d(box).rejected} not in ${ACTIVE_SPECIALTY}` : ""}`,
      extra: latencyLine(lat),
    };
    case "specialty_rescore": return {
      explanation: "re-evaluate after PubMed changes",
      counts: `${d(box).scored} scored · ${d(box).failed} failed${d(box).approved !== undefined ? ` · ${d(box).approved} in ${ACTIVE_SPECIALTY} · ${d(box).rejected} not in ${ACTIVE_SPECIALTY}` : ""}`,
      extra: latencyLine(lat),
    };
    case "auto_tag_article_type": return {
      explanation: "deterministic pre-filter for in-specialty articles",
      counts: `${d(box).approved} scored`,
      extra: "",
    };
    case "subspecialty_new":
    case "subspecialty_rescore": return {
      explanation: "which subspecialty does this belong to?",
      counts: `${d(box).scored} scored · ${d(box).failed} failed`,
      extra: latencyLine(lat),
    };
    case "article_type_new":
    case "article_type_rescore": return {
      explanation: "classify article type",
      counts: `${d(box).scored} scored · ${d(box).failed} failed`,
      extra: latencyLine(lat),
    };
    case "condensation_text_new":
    case "condensation_text_rescore": return {
      explanation: "summary text for the article",
      counts: `${d(box).scored} scored · ${d(box).failed} failed`,
      extra: latencyLine(lat),
    };
    case "geo_class_a_new":
    case "geo_class_a_rescore": return {
      explanation: "clean single-address geo",
      counts: `${d(box).scored} scored · ${d(box).failed} failed${d(box).country_tagged !== undefined ? ` · ${d(box).country_tagged} country-tagged` : ""}`,
      extra: latencyLine(lat),
    };
    case "geo_class_b_new":
    case "geo_class_b_rescore": return {
      explanation: "clean multi-address geo",
      counts: `${d(box).scored} scored · ${d(box).failed} failed`,
      extra: latencyLine(lat),
    };
    case "sari_new": return {
      explanation: "subject, action, result, implication",
      counts: `${d(box).scored} scored · ${d(box).failed} failed`,
      extra: latencyLine(lat),
    };
    case "sari_rescore": return {
      explanation: "re-run when summary text changes",
      counts: `${d(box).scored} scored · ${d(box).failed} failed`,
      extra: latencyLine(lat),
    };
    case "ready_by_morning": return {
      explanation: "",
      counts: `${d(box).imported_in_window} imported · ${d(box).in_specialty} in-specialty · ${d(box).out_of_specialty} out${d(box).pending > 0 ? ` · ${d(box).pending} pending` : ""}`,
      extra: `Total ${ACTIVE_SPECIALTY} articles: ${Number(d(box).total_in_specialty ?? d(box).total_in_system).toLocaleString()} · prev night: ${Number(d(box).previous_night_in_specialty ?? d(box).previous_night_total).toLocaleString()} (+${d(box).delta})`,
    };
    case "scoring_batch_poll": return {
      explanation: "check if Claude finished scoring",
      counts: `${d(box).total_runs} runs · ${d(box).succeeded} succeeded · ${d(box).failed} failed`,
      extra: `${d(box).batches_changed_state} batches → ended`,
    };
    case "scoring_batch_ingest": return {
      explanation: "pull results into our DB",
      counts: `${d(box).total_runs} runs · ${d(box).succeeded} succeeded · ${d(box).failed} failed`,
      extra: `${d(box).batches_changed_state} batches → ingested`,
    };
    default: return {
      explanation: "",
      counts: JSON.stringify(box.details).slice(0, 60),
      extra: "",
    };
  }
}
