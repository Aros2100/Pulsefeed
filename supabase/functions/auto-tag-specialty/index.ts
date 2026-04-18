import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_URL = "https://pulsefeed-eta.vercel.app";
const ROUTE = "/api/cron/auto-tag-specialty";

Deno.serve(async (_req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${APP_URL}${ROUTE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
    });
    const body = await res.json();
    return new Response(JSON.stringify({ ok: true, status: res.status, body }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
