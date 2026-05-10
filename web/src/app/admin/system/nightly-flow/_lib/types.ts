export type BoxStatus = "ok" | "expected_silent" | "warn" | "error" | "missing";

export type Timing = {
  started_at: string;
  completed_at: string;
  duration_sec: number;
} | null;

export type ComponentBox = {
  status: BoxStatus;
  heading: string;
  technical_name: string | null;
  details: Record<string, unknown>;
  timing: Timing;
};

export type Irregularity = {
  component: string;
  kind: "slow_total" | "very_slow_total" | "critical_total" | "stuck_at_anthropic" | "stuck_in_ingest";
  severity: "warn" | "error";
  message: string;
  detail: Record<string, number>;
};

export type Summary = {
  total_components: number;
  ok_count: number;
  warn_count: number;
  error_count: number;
  headline_status: "ok" | "warn" | "error";
  headline_text: string;
};

export type NightlyFlowReport = {
  date: string;
  window_start: string;
  window_end: string;
  summary: Summary;
  tier1_import_circles: { import_c1: ComponentBox; import_c2: ComponentBox; import_c4: ComponentBox };
  tier1_combined: { daily_import: ComponentBox };
  tier2_sync_authorlink: { daily_pubmed_sync: ComponentBox; trigger_author_linking: ComponentBox };
  tier3_autotag_authorupdate: { auto_tag_specialty: ComponentBox; daily_author_update: ComponentBox };
  tier4_specialty_scoring: { specialty_new: ComponentBox; specialty_rescore: ComponentBox };
  tier5_autotag_articletype: { auto_tag_article_type: ComponentBox };
  tier6_scoring_swarm: {
    subspecialty_new: ComponentBox;
    subspecialty_rescore: ComponentBox;
    article_type_new: ComponentBox;
    article_type_rescore: ComponentBox;
    condensation_text_new: ComponentBox;
    condensation_text_rescore: ComponentBox;
    geo_class_a_new: ComponentBox;
    geo_class_a_rescore: ComponentBox;
    geo_class_b_new: ComponentBox;
    geo_class_b_rescore: ComponentBox;
  };
  tier7_sari: { sari_new: ComponentBox; sari_rescore: ComponentBox };
  tier8_result: { ready_by_morning: ComponentBox };
  tier9_background: { scoring_batch_poll: ComponentBox; scoring_batch_ingest: ComponentBox };
  irregularities: Irregularity[];
};
