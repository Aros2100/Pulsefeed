import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_URL = "https://app.pulsefeeds.com";
const ROUTE   = "/api/cron/auto-tag-specialty";

Deno.serve(async (_req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("[auto-tag-specialty] CRON_SECRET not set");
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[auto-tag-specialty] Triggering...");
  try {
    const res = await fetch(`${APP_URL}${ROUTE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
    });
    const text = await res.text();
    console.log("[auto-tag-specialty] Raw response:", res.status, text.slice(0, 500));

    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    console.log("[auto-tag-specialty] Response:", res.status, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, status: res.status, body }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auto-tag-specialty] Fetch failed:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
