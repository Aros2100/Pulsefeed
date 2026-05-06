import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ── Styles (matching /admin/system/scoring) ────────────────────────────────

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
  display: "flex", alignItems: "center", justifyContent: "space-between",
};
const headerLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.08em",
  textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
};

// ── Helpers ────────────────────────────────────────────────────────────────

type JobStatus = "ok" | "warn" | "error" | "pending";

const ICONS: Record<JobStatus, string> = { ok: "✅", warn: "⚠️", error: "❌", pending: "⏳" };

function icon(s: JobStatus) { return ICONS[s]; }

function combinedStatus(
  cronOk: boolean | null, // null = no cron entry found
  downstreamFound: boolean,
  downstreamOk: boolean,
): JobStatus {
  if (cronOk === null) return "pending";
  if (!cronOk) return "error";
  if (!downstreamFound) return "warn";
  return downstreamOk ? "ok" : "error";
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

function fmtDur(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <span style={{ marginRight: "20px", fontSize: "12px" }}>
      <span style={{ color: "#888" }}>{label}: </span>
      <span style={{ fontWeight: 600, color: color ?? "#1a1a1a" }}>{value}</span>
    </span>
  );
}

// ── Scoring module config ──────────────────────────────────────────────────

const SCORING_JOBS: { jobName: string; module: string; label: string }[] = [
  { jobName: "specialty-scoring-new",             module: "specialty",          label: "Specialty · new"              },
  { jobName: "specialty-scoring-rescore",          module: "specialty",          label: "Specialty · rescore"          },
  { jobName: "subspecialty-scoring-new",           module: "subspecialty",       label: "Subspecialty · new"           },
  { jobName: "subspecialty-scoring-rescore",       module: "subspecialty",       label: "Subspecialty · rescore"       },
  { jobName: "article-type-scoring-new",           module: "article_type_prod",  label: "Article Type · new"           },
  { jobName: "article-type-scoring-rescore",       module: "article_type_prod",  label: "Article Type · rescore"       },
  { jobName: "condensation-text-scoring-new",      module: "condensation_text",  label: "Condensation Text · new"      },
  { jobName: "condensation-text-scoring-rescore",  module: "condensation_text",  label: "Condensation Text · rescore"  },
  { jobName: "condensation-sari-scoring-new",      module: "condensation_sari",  label: "Condensation SARI · new"      },
  { jobName: "condensation-sari-scoring-rescore",  module: "condensation_sari",  label: "Condensation SARI · rescore"  },
  { jobName: "article-geo-class-a-scoring-new",    module: "article_geo_class_a","label": "Geo Class A · new"          },
  { jobName: "article-geo-class-a-scoring-rescore",module: "article_geo_class_a","label": "Geo Class A · rescore"      },
  { jobName: "article-geo-class-b-scoring-new",    module: "article_geo_class_b","label": "Geo Class B · new"          },
  { jobName: "article-geo-class-b-scoring-rescore",module: "article_geo_class_b","label": "Geo Class B · rescore"      },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default async function NightlyStatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp    = await searchParams;
  const since = sp.since ? new Date(sp.since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const until = sp.until ? new Date(sp.until)  : new Date();
  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // ── Parallel fetches ─────────────────────────────────────────────────────

  const [
    cronRes,
    importRes,
    pubmedRes,
    authorUpdateRes,
    autoTagRes,
    scoringBatchRes,
  ] = await Promise.all([
    // pg_cron runs
    db.rpc("get_cron_job_runs", { p_since: sinceISO, p_until: untilISO }),
    // import logs (cron-triggered)
    db.from("import_logs").select("id, circle, status, articles_imported, articles_fetched, started_at, completed_at, errors, trigger").eq("trigger", "cron").gte("started_at", sinceISO).lte("started_at", untilISO).order("started_at"),
    // pubmed sync events
    db.from("pubmed_sync_log").select("id, event", { count: "exact", head: false }).gte("synced_at", sinceISO).lte("synced_at", untilISO),
    // author update (cron-triggered)
    db.from("author_update_logs").select("id, status, processed, scenario_a, scenario_b, scenario_c, unmatched, errors, started_at, completed_at, triggered_by").eq("triggered_by", "cron").gte("started_at", sinceISO).lte("started_at", untilISO).order("started_at"),
    // auto-tag logs
    db.from("auto_tag_logs").select("id, job, status, approved, started_at, completed_at, errors").gte("started_at", sinceISO).lte("started_at", untilISO).order("started_at"),
    // scoring batches (cron)
    db.from("scoring_batches").select("id, module, status, article_count, submitted_at, ended_at, ingested_at, stats, triggered_by, error").eq("triggered_by", "cron").gte("submitted_at", sinceISO).lte("submitted_at", untilISO).order("submitted_at"),
  ]);

  type CronRun = { jobid: number; jobname: string; schedule: string; start_time: string; end_time: string | null; status: string; return_message: string | null };
  type ImportLog = { id: string; circle: number | null; status: string; articles_imported: number | null; articles_fetched: number | null; started_at: string; completed_at: string | null; errors: unknown; trigger: string };
  type AutoTagLog = { id: string; job: string; status: string; approved: number | null; started_at: string; completed_at: string | null; errors: string[] | null };
  type AuthorUpdateLog = { id: string; status: string; processed: number | null; scenario_a: number | null; scenario_b: number | null; scenario_c: number | null; unmatched: number | null; errors: unknown; started_at: string; completed_at: string | null; triggered_by: string };
  type ScoringBatch = { id: string; module: string; status: string; article_count: number | null; submitted_at: string; ended_at: string | null; ingested_at: string | null; stats: Record<string, number> | null; triggered_by: string; error: string | null };

  const cronRuns    = (cronRes.data        ?? []) as CronRun[];
  const importLogs  = (importRes.data      ?? []) as ImportLog[];
  const pubmedCount = (pubmedRes.data?.length ?? 0) as number;
  const updateLogs  = (authorUpdateRes.data ?? []) as AuthorUpdateLog[];
  const autoTagLogs = (autoTagRes.data     ?? []) as AutoTagLog[];
  const scoringBatches = (scoringBatchRes.data ?? []) as ScoringBatch[];

  // Fetch linking logs for cron import_log_ids
  const cronImportIds = importLogs.map(l => l.id);
  let linkingLogs: { id: string; status: string; articles_processed: number | null; authors_linked: number | null; started_at: string; completed_at: string | null; errors: unknown }[] = [];
  if (cronImportIds.length > 0) {
    const { data: ll } = await db
      .from("author_linking_logs")
      .select("id, status, articles_processed, authors_linked, started_at, completed_at, errors")
      .in("import_log_id", cronImportIds)
      .order("started_at");
    linkingLogs = ll ?? [];
  }

  // ── Build cron run index (jobname → most recent run) ─────────────────────
  const cronByJob = new Map<string, CronRun>();
  for (const r of cronRuns) {
    const existing = cronByJob.get(r.jobname);
    if (!existing || r.start_time > existing.start_time) cronByJob.set(r.jobname, r);
  }

  // Count scoring-batch-poll / ingest runs
  const pollRuns   = cronRuns.filter(r => r.jobname === "scoring-batch-poll");
  const ingestRuns = cronRuns.filter(r => r.jobname === "scoring-batch-ingest");

  // ── Compute overall summary ───────────────────────────────────────────────
  const PIPELINE_JOBS = ["daily-import","daily-pubmed-sync","trigger-author-linking","auto-tag-specialty","daily-author-update","auto-tag-article-type"];
  const ALL_NAMED_JOBS = [...PIPELINE_JOBS, ...SCORING_JOBS.map(j => j.jobName)];

  const statuses: JobStatus[] = [];

  // Import
  const importCron = cronByJob.get("daily-import");
  const importOk = importLogs.length > 0 && importLogs.every(l => l.status === "completed" || l.status === "done");
  statuses.push(combinedStatus(importCron?.status === "succeeded" ? true : importCron ? false : null, importLogs.length > 0, importOk));

  // Pubmed sync
  const syncCron = cronByJob.get("daily-pubmed-sync");
  statuses.push(combinedStatus(syncCron?.status === "succeeded" ? true : syncCron ? false : null, pubmedCount > 0, true));

  // Author linking
  const linkCron = cronByJob.get("trigger-author-linking");
  const linkOk = linkingLogs.length > 0 && linkingLogs.every(l => l.status === "completed" || l.status === "done");
  statuses.push(combinedStatus(linkCron?.status === "succeeded" ? true : linkCron ? false : null, linkingLogs.length > 0, linkOk));

  // Auto-tag specialty
  const atsCron = cronByJob.get("auto-tag-specialty");
  const atsLogs = autoTagLogs.filter(l => l.job === "specialty");
  statuses.push(combinedStatus(atsCron?.status === "succeeded" ? true : atsCron ? false : null, atsLogs.length > 0, atsLogs.every(l => l.status === "completed")));

  // Author update
  const updateCron = cronByJob.get("daily-author-update");
  const updateOk = updateLogs.length > 0 && updateLogs.every(l => l.status === "completed");
  statuses.push(combinedStatus(updateCron?.status === "succeeded" ? true : updateCron ? false : null, updateLogs.length > 0, updateOk));

  // Auto-tag article-type
  const atatCron = cronByJob.get("auto-tag-article-type");
  const atatLogs = autoTagLogs.filter(l => l.job === "article_type");
  statuses.push(combinedStatus(atatCron?.status === "succeeded" ? true : atatCron ? false : null, atatLogs.length > 0, atatLogs.every(l => l.status === "completed")));

  // Scoring jobs
  for (const sj of SCORING_JOBS) {
    const cron = cronByJob.get(sj.jobName);
    const batches = scoringBatches.filter(b => b.module === sj.module);
    const batchOk = batches.length > 0 && batches.every(b => b.status === "ingested" || b.status === "ended");
    statuses.push(combinedStatus(cron?.status === "succeeded" ? true : cron ? false : null, batches.length > 0, batchOk));
  }

  const totalJobs = ALL_NAMED_JOBS.length;
  const okCount   = statuses.filter(s => s === "ok").length;
  const warnCount = statuses.filter(s => s === "warn").length;
  const errCount  = statuses.filter(s => s === "error").length;
  const pendCount = statuses.filter(s => s === "pending").length;

  const overallStatus: JobStatus = errCount > 0 ? "error" : warnCount > 0 ? "warn" : pendCount === totalJobs ? "pending" : "ok";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 48px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin" style={{ color: "#5a6a85", textDecoration: "none" }}>Admin</Link>
          {" / "}
          <Link href="/admin/system" style={{ color: "#5a6a85", textDecoration: "none" }}>System</Link>
          {" / Nightly Status"}
        </div>

        {/* Heading + date selector */}
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 4px" }}>Nightly Status</h1>
            <div style={{ fontSize: "13px", color: "#888" }}>
              {fmt(sinceISO)} → {fmt(untilISO)}
            </div>
          </div>
          <form method="GET" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ fontSize: "12px", color: "#5a6a85" }}>From</label>
            <input type="datetime-local" name="since" defaultValue={since.toISOString().slice(0,16)}
              style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #dde3ed", borderRadius: "6px", fontFamily: "inherit" }} />
            <label style={{ fontSize: "12px", color: "#5a6a85" }}>To</label>
            <input type="datetime-local" name="until" defaultValue={until.toISOString().slice(0,16)}
              style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #dde3ed", borderRadius: "6px", fontFamily: "inherit" }} />
            <button type="submit" style={{ fontSize: "12px", fontWeight: 600, padding: "5px 14px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>
              Apply
            </button>
            <Link href="/admin/system/nightly-status" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>Reset</Link>
          </form>
        </div>

        {/* ── Summary bar ───────────────────────────────────────────────────── */}
        <div style={{ ...sectionCard, padding: "16px 20px", display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "22px" }}>{icon(overallStatus)}</span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>
              {overallStatus === "ok" ? "All jobs OK" : overallStatus === "error" ? "Failures detected" : overallStatus === "warn" ? "Warnings — cron fired but no downstream result" : "No data for window"}
            </div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
              {totalJobs} jobs · ✅ {okCount} · ⚠️ {warnCount} · ❌ {errCount} · ⏳ {pendCount}
            </div>
          </div>
        </div>

        {/* ── Pipeline Jobs ─────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Pipeline Jobs</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#fafbfc", borderBottom: "1px solid #eee" }}>
                <Th>Job</Th><Th>pg_cron</Th><Th>Started</Th><Th>Duration</Th><Th>Details</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {/* daily-import */}
              {(() => {
                const cron = cronByJob.get("daily-import");
                const circles = [1,2,3,4].map(c => importLogs.filter(l => l.circle === c));
                const hasAny = importLogs.length > 0;
                const allOk  = hasAny && importLogs.every(l => l.status === "completed" || l.status === "done");
                const st = combinedStatus(cron?.status === "succeeded" ? true : cron ? false : null, hasAny, allOk);
                return (
                  <tr style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <Td><strong>daily-import</strong><br /><span style={{ fontSize: "11px", color: "#94a3b8" }}>02:00 UTC</span></Td>
                    <Td><CronBadge run={cron ?? null} /></Td>
                    <Td>{fmt(importLogs[0]?.started_at ?? null)}</Td>
                    <Td>{importLogs.length > 0 ? fmtDur(importLogs[0].started_at, importLogs[importLogs.length-1].completed_at) : "—"}</Td>
                    <Td>
                      {[1,2,3,4].map(c => {
                        const rows = importLogs.filter(l => l.circle === c);
                        if (rows.length === 0) return null;
                        const n = rows.reduce((s,r) => s + (r.articles_imported ?? 0), 0);
                        return <span key={c} style={{ marginRight: "12px", color: "#5a6a85" }}>C{c}: <strong>{n}</strong> imported</span>;
                      })}
                      {importLogs.length === 0 && <span style={{ color: "#94a3b8" }}>No rows in window</span>}
                    </Td>
                    <Td>{icon(st)}</Td>
                  </tr>
                );
              })()}

              {/* daily-pubmed-sync */}
              {(() => {
                const cron = cronByJob.get("daily-pubmed-sync");
                const st = combinedStatus(cron?.status === "succeeded" ? true : cron ? false : null, pubmedCount > 0, true);
                return (
                  <tr style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <Td><strong>daily-pubmed-sync</strong><br /><span style={{ fontSize: "11px", color: "#94a3b8" }}>02:05 UTC</span></Td>
                    <Td><CronBadge run={cron ?? null} /></Td>
                    <Td>—</Td><Td>—</Td>
                    <Td><KV label="sync events" value={pubmedCount} /></Td>
                    <Td>{icon(st)}</Td>
                  </tr>
                );
              })()}

              {/* trigger-author-linking */}
              {(() => {
                const cron = cronByJob.get("trigger-author-linking");
                const hasAny = linkingLogs.length > 0;
                const allOk  = hasAny && linkingLogs.every(l => l.status === "completed" || l.status === "done");
                const st = combinedStatus(cron?.status === "succeeded" ? true : cron ? false : null, hasAny, allOk);
                const latest = linkingLogs[0] ?? null;
                return (
                  <tr style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <Td><strong>trigger-author-linking</strong><br /><span style={{ fontSize: "11px", color: "#94a3b8" }}>02:05 UTC</span></Td>
                    <Td><CronBadge run={cron ?? null} /></Td>
                    <Td>{fmt(latest?.started_at ?? null)}</Td>
                    <Td>{fmtDur(latest?.started_at ?? null, latest?.completed_at ?? null)}</Td>
                    <Td>
                      {latest
                        ? <><KV label="articles" value={latest.articles_processed ?? "—"} /><KV label="linked" value={latest.authors_linked ?? "—"} /></>
                        : <span style={{ color: "#94a3b8" }}>No rows in window</span>}
                    </Td>
                    <Td>{icon(st)}</Td>
                  </tr>
                );
              })()}

              {/* auto-tag-specialty */}
              {(() => {
                const cron = cronByJob.get("auto-tag-specialty");
                const logs = autoTagLogs.filter(l => l.job === "specialty");
                const latest = logs[0] ?? null;
                const allOk = logs.length > 0 && logs.every(l => l.status === "completed");
                const st = combinedStatus(cron?.status === "succeeded" ? true : cron ? false : null, logs.length > 0, allOk);
                return (
                  <tr style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <Td><strong>auto-tag-specialty</strong><br /><span style={{ fontSize: "11px", color: "#94a3b8" }}>02:10 UTC</span></Td>
                    <Td><CronBadge run={cron ?? null} /></Td>
                    <Td>{fmt(latest?.started_at ?? null)}</Td>
                    <Td>{fmtDur(latest?.started_at ?? null, latest?.completed_at ?? null)}</Td>
                    <Td>
                      {latest ? <KV label="approved" value={latest.approved ?? "—"} color="#059669" /> : <span style={{ color: "#94a3b8" }}>No rows</span>}
                    </Td>
                    <Td>{icon(st)}</Td>
                  </tr>
                );
              })()}

              {/* daily-author-update */}
              {(() => {
                const cron = cronByJob.get("daily-author-update");
                const latest = updateLogs[0] ?? null;
                const allOk = updateLogs.length > 0 && updateLogs.every(l => l.status === "completed");
                const st = combinedStatus(cron?.status === "succeeded" ? true : cron ? false : null, updateLogs.length > 0, allOk);
                return (
                  <tr style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <Td><strong>daily-author-update</strong><br /><span style={{ fontSize: "11px", color: "#94a3b8" }}>02:10 UTC</span></Td>
                    <Td><CronBadge run={cron ?? null} /></Td>
                    <Td>{fmt(latest?.started_at ?? null)}</Td>
                    <Td>{fmtDur(latest?.started_at ?? null, latest?.completed_at ?? null)}</Td>
                    <Td>
                      {latest
                        ? <><KV label="processed" value={latest.processed ?? "—"} /><KV label="status" value={latest.status} color={latest.status === "completed" ? "#059669" : "#dc2626"} /></>
                        : <span style={{ color: "#94a3b8" }}>No rows</span>}
                    </Td>
                    <Td>{icon(st)}</Td>
                  </tr>
                );
              })()}

              {/* auto-tag-article-type */}
              {(() => {
                const cron = cronByJob.get("auto-tag-article-type");
                const logs = autoTagLogs.filter(l => l.job === "article_type");
                const latest = logs[0] ?? null;
                const allOk = logs.length > 0 && logs.every(l => l.status === "completed");
                const st = combinedStatus(cron?.status === "succeeded" ? true : cron ? false : null, logs.length > 0, allOk);
                return (
                  <tr>
                    <Td><strong>auto-tag-article-type</strong><br /><span style={{ fontSize: "11px", color: "#94a3b8" }}>02:30 UTC</span></Td>
                    <Td><CronBadge run={cron ?? null} /></Td>
                    <Td>{fmt(latest?.started_at ?? null)}</Td>
                    <Td>{fmtDur(latest?.started_at ?? null, latest?.completed_at ?? null)}</Td>
                    <Td>
                      {latest ? <KV label="approved" value={latest.approved ?? "—"} color="#059669" /> : <span style={{ color: "#94a3b8" }}>No rows</span>}
                    </Td>
                    <Td>{icon(st)}</Td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>

        {/* ── Scoring Jobs ──────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Scoring Jobs (14)</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#fafbfc", borderBottom: "1px solid #eee" }}>
                <Th>Job</Th><Th>pg_cron</Th><Th>Submitted</Th><Th>Batch status</Th><Th>Articles</Th><Th>Stats</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {SCORING_JOBS.map((sj, i) => {
                const cron = cronByJob.get(sj.jobName);
                // Match batches: same module, submitted in window
                // For new vs rescore: cron fires both at same time so we can't perfectly distinguish
                // Show the batch closest in time to the cron run, or all batches for the module
                const modBatches = scoringBatches.filter(b => b.module === sj.module);
                // Heuristic: new jobs come first, rescore after — match by index
                const isRescore = sj.jobName.endsWith("-rescore");
                const matchedBatches = isRescore ? modBatches.slice(Math.floor(modBatches.length / 2)) : modBatches.slice(0, Math.ceil(modBatches.length / 2));
                const batch = matchedBatches[0] ?? null;
                const batchOk = batch?.status === "ingested" || batch?.status === "ended";
                const st = combinedStatus(
                  cron?.status === "succeeded" ? true : cron ? false : null,
                  !!batch,
                  batchOk,
                );
                const stats = batch?.stats as Record<string, number> | null;
                const isLast = i === SCORING_JOBS.length - 1;
                return (
                  <tr key={sj.jobName} style={{ borderBottom: isLast ? "none" : "1px solid #f5f5f5" }}>
                    <Td>
                      <strong>{sj.label}</strong><br />
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>{cron?.schedule ?? "—"}</span>
                    </Td>
                    <Td><CronBadge run={cron ?? null} /></Td>
                    <Td>{fmt(batch?.submitted_at ?? null)}</Td>
                    <Td>
                      {batch
                        ? <BatchStatusBadge status={batch.status} />
                        : <span style={{ color: "#94a3b8", fontSize: "12px" }}>No batch</span>}
                      {batch?.error && <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "3px" }}>{batch.error}</div>}
                    </Td>
                    <Td>{batch?.article_count ?? "—"}</Td>
                    <Td>
                      {stats
                        ? Object.entries(stats).map(([k,v]) => <KV key={k} label={k} value={v} />)
                        : "—"}
                    </Td>
                    <Td>{icon(st)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Auto-poll & Ingest ────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Auto-poll &amp; Ingest (every 5 min)</span>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", gap: "40px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>scoring-batch-poll</div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>{pollRuns.length}</div>
              <div style={{ fontSize: "12px", color: "#888" }}>runs in window</div>
              <div style={{ fontSize: "12px", color: pollRuns.some(r => r.status !== "succeeded") ? "#dc2626" : "#059669", marginTop: "4px" }}>
                {pollRuns.filter(r => r.status === "succeeded").length} succeeded · {pollRuns.filter(r => r.status !== "succeeded").length} failed
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>scoring-batch-ingest</div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>{ingestRuns.length}</div>
              <div style={{ fontSize: "12px", color: "#888" }}>runs in window</div>
              <div style={{ fontSize: "12px", color: ingestRuns.some(r => r.status !== "succeeded") ? "#dc2626" : "#059669", marginTop: "4px" }}>
                {ingestRuns.filter(r => r.status === "succeeded").length} succeeded · {ingestRuns.filter(r => r.status !== "succeeded").length} failed
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Batches ingested</div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>
                {scoringBatches.filter(b => b.ingested_at).length}
              </div>
              <div style={{ fontSize: "12px", color: "#888" }}>of {scoringBatches.length} cron batches</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Batches in progress</div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>
                {scoringBatches.filter(b => b.status === "in_progress" || b.status === "submitted").length}
              </div>
              <div style={{ fontSize: "12px", color: "#888" }}>still running</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "8px", fontSize: "12px", color: "#94a3b8" }}>
          ⚠️ pg_cron <strong>succeeded</strong> means the HTTP trigger fired — not that downstream code succeeded.
          Verify each job against its downstream log.
        </div>

      </div>
    </div>
  );
}

// ── UI sub-components ──────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 16px" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "10px 16px", verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function CronBadge({ run }: { run: { status: string; start_time: string; return_message: string | null } | null }) {
  if (!run) return <span style={{ fontSize: "11px", color: "#94a3b8" }}>not triggered</span>;
  const ok = run.status === "succeeded";
  return (
    <div>
      <span style={{ fontSize: "11px", fontWeight: 600, color: ok ? "#059669" : "#dc2626", background: ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`, borderRadius: "4px", padding: "2px 7px" }}>
        {run.status}
      </span>
      {!ok && run.return_message && (
        <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "3px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {run.return_message}
        </div>
      )}
    </div>
  );
}

function BatchStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; border: string; color: string }> = {
    ingested:    { bg: "#f0fdf4", border: "#bbf7d0", color: "#059669" },
    ended:       { bg: "#f0fdf4", border: "#bbf7d0", color: "#059669" },
    in_progress: { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
    submitted:   { bg: "#fef9c3", border: "#fef08a", color: "#a16207" },
    failed:      { bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
  };
  const c = colors[status] ?? colors.submitted;
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, background: c.bg, border: `1px solid ${c.border}`, color: c.color, borderRadius: "4px", padding: "2px 7px" }}>
      {status}
    </span>
  );
}
