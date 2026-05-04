import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const FROM = "PulseFeeds Alerts <alerts@pulsefeeds.com>";
const STALE_HOURS = 26;

function isStale(ts: string | null): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > STALE_HOURS * 60 * 60 * 1000;
}

function firstError(errors: unknown): string | null {
  if (!errors || !Array.isArray(errors) || errors.length === 0) return null;
  const e = errors[0];
  return typeof e === "string" ? e : (e as { error?: string })?.error ?? JSON.stringify(e);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  const [c1Res, c4Res, c2Res, authorRes, syncRes] = await Promise.all([
    admin.from("import_logs").select("status, started_at, errors, articles_imported")
      .eq("circle", 1).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("import_logs").select("status, started_at, errors, articles_imported")
      .eq("circle", 4).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("import_logs").select("status, started_at, errors, articles_imported")
      .eq("circle", 2).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    a.from("author_update_logs").select("status, started_at, errors, processed")
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
    a.rpc("pubmed_sync_log_runs"),
  ]);

  const c1     = c1Res.data     as { status: string; started_at: string | null; errors: unknown; articles_imported: number | null } | null;
  const c4     = c4Res.data     as { status: string; started_at: string | null; errors: unknown; articles_imported: number | null } | null;
  const c2     = c2Res.data     as { status: string; started_at: string | null; errors: unknown; articles_imported: number | null } | null;
  const author = authorRes.data as { status: string; started_at: string | null; errors: unknown; processed: number | null } | null;
  const syncs  = (syncRes.data ?? []) as { run_time: string; updated: number }[];
  const sync   = syncs[0] ?? null;

  type FailedJob = { name: string; reason: string; error: string | null };
  const failed: FailedJob[] = [];

  function checkCircle(name: string, log: typeof c1) {
    if (!log) { failed.push({ name, reason: "No run found", error: null }); return; }
    if (log.status === "failed") { failed.push({ name, reason: "Status: failed", error: firstError(log.errors) }); return; }
    if (isStale(log.started_at)) { failed.push({ name, reason: "Stale — did not run last night", error: null }); }
  }

  checkCircle("C1 Import", c1);
  checkCircle("C4 Import", c4);
  checkCircle("C2 Import", c2);

  if (!author) {
    failed.push({ name: "Author Update", reason: "No run found", error: null });
  } else if (author.status === "failed") {
    failed.push({ name: "Author Update", reason: "Status: failed", error: firstError(author.errors) });
  } else if (isStale(author.started_at)) {
    failed.push({ name: "Author Update", reason: "Stale — did not run last night", error: null });
  }

  const syncTs = sync?.run_time ? sync.run_time + ":00Z" : null;
  if (!sync) {
    failed.push({ name: "PubMed Sync", reason: "No run found", error: null });
  } else if (isStale(syncTs)) {
    failed.push({ name: "PubMed Sync", reason: "Stale — did not run last night", error: null });
  }

  if (failed.length === 0) {
    return NextResponse.json({ ok: true, message: "All jobs healthy" });
  }

  // Send alert email
  const alertEmail = process.env.ALERT_EMAIL;
  if (!alertEmail) {
    console.error("[nightly-check] ALERT_EMAIL not set — skipping email");
    return NextResponse.json({ ok: true, failedJobs: failed, emailSent: false });
  }

  const lines = failed.map((j) => {
    const errLine = j.error ? `\n    Error: ${j.error}` : "";
    return `• ${j.name}: ${j.reason}${errLine}`;
  });

  const body = [
    `PulseFeed nightly check — ${failed.length} job(s) failed\n`,
    ...lines,
    `\nChecked at: ${new Date().toUTCString()}`,
  ].join("\n");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailErr } = await resend.emails.send({
    from:    FROM,
    to:      alertEmail,
    subject: `⚠️ PulseFeed nightly report — ${failed.length} job(s) failed`,
    text:    body,
  });

  if (emailErr) {
    console.error("[nightly-check] Failed to send alert email:", (emailErr as { message?: string }).message);
  }

  return NextResponse.json({ ok: true, failedJobs: failed, emailSent: !emailErr });
}
