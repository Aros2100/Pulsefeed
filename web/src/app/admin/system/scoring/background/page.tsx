export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BackgroundCronSection } from "./_components/BackgroundCronSection";

type CronStats = {
  total_runs: number;
  succeeded: number;
  failed: number;
  last_run: string | null;
};

type BatchRow = {
  id: string;
  module: string;
  anthropic_batch_id: string | null;
  article_count: number | null;
  timestamp: string | null;
};

export default async function BackgroundCronPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pollStatsRes, ingestStatsRes, pollBatchesRes, ingestBatchesRes] = await Promise.all([
    admin.rpc("get_background_cron_stats", { p_jobname: "scoring-batch-poll",   p_since: since }),
    admin.rpc("get_background_cron_stats", { p_jobname: "scoring-batch-ingest", p_since: since }),
    admin.from("scoring_batches")
      .select("id, module, anthropic_batch_id, article_count, ended_at")
      .gte("ended_at", since)
      .order("ended_at", { ascending: false })
      .limit(50),
    admin.from("scoring_batches")
      .select("id, module, anthropic_batch_id, article_count, ingested_at")
      .gte("ingested_at", since)
      .order("ingested_at", { ascending: false })
      .limit(50),
  ]);

  const pollStats:   CronStats | null = pollStatsRes.data   ?? null;
  const ingestStats: CronStats | null = ingestStatsRes.data ?? null;

  type RawEnded    = { id: string; module: string; anthropic_batch_id: string | null; article_count: number | null; ended_at: string | null };
  type RawIngested = { id: string; module: string; anthropic_batch_id: string | null; article_count: number | null; ingested_at: string | null };

  const pollBatches: BatchRow[] = ((pollBatchesRes.data ?? []) as RawEnded[]).map(b => ({
    id: b.id, module: b.module, anthropic_batch_id: b.anthropic_batch_id,
    article_count: b.article_count, timestamp: b.ended_at,
  }));

  const ingestBatches: BatchRow[] = ((ingestBatchesRes.data ?? []) as RawIngested[]).map(b => ({
    id: b.id, module: b.module, anthropic_batch_id: b.anthropic_batch_id,
    article_count: b.article_count, timestamp: b.ingested_at,
  }));

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px 80px" }}>

        <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
          <Link href="/admin/system/scoring" style={{ color: "#94a3b8", textDecoration: "none" }}>← Scoring</Link>
        </div>
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>
          System · Scoring · Background
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", marginBottom: "28px" }}>
          Background cron jobs
        </h1>

        <BackgroundCronSection
          id="poll"
          job="poll"
          title="Poll"
          jobname="scoring-batch-poll"
          tableHeading="Recent state changes (last 24h)"
          timeLabel="Ended"
          stats={pollStats}
          batches={pollBatches}
        />

        <BackgroundCronSection
          id="ingest"
          job="ingest"
          title="Ingest"
          jobname="scoring-batch-ingest"
          tableHeading="Recent ingests (last 24h)"
          timeLabel="Ingested"
          stats={ingestStats}
          batches={ingestBatches}
        />

      </div>
    </div>
  );
}
