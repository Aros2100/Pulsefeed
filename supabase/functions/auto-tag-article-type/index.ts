import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_URL = "https://pulsefeed-eta.vercel.app";
const ROUTE   = "/api/cron/auto-tag-article-type";

Deno.serve(async (_req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("[auto-tag-article-type] CRON_SECRET not set");
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[auto-tag-article-type] Triggering...");
  try {
    const res = await fetch(`${APP_URL}${ROUTE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
    });
    const text = await res.text();
    console.log("[auto-tag-article-type] Raw response:", res.status, text.slice(0, 500));

    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    console.log("[auto-tag-article-type] Response:", res.status, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, status: res.status, body }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auto-tag-article-type] Fetch failed:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
