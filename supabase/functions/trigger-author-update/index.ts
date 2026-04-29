import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_URL = "https://pulsefeed-eta.vercel.app";
const ROUTE   = "/api/authors/update-changed";

Deno.serve(async (_req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("[trigger-author-update] CRON_SECRET not set");
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[trigger-author-update] Triggering author update...");
  try {
    const res = await fetch(`${APP_URL}${ROUTE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ dryRun: false, limit: 1500, triggeredBy: "cron" }),
    });
    const body = await res.json();
    console.log("[trigger-author-update] Response:", res.status, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, status: res.status, body }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trigger-author-update] Fetch failed:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
