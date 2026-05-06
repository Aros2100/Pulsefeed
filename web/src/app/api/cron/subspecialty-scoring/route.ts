import { type NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

const bodySchema = z.object({
  mode:  z.enum(["new", "rescore"]),
  since: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron/subspecialty-scoring] CRON_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { mode } = parsed.data;
  const since = parsed.data.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const submitUrl = new URL("/api/scoring/batch/subspecialty/submit", request.url);
  const payload = { specialty: ACTIVE_SPECIALTY, mode, since, limit: 500 };

  after(async () => {
    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`[cron/subspecialty-scoring] submit failed: ${res.status}`, JSON.stringify(result));
      } else {
        console.log(`[cron/subspecialty-scoring] mode=${mode} since=${since} → batchId=${result.batchId} count=${result.articleCount}`);
      }
    } catch (e) {
      console.error("[cron/subspecialty-scoring] submit threw:", e);
    }
  });

  return NextResponse.json({
    ok:       true,
    accepted: true,
    mode,
    since,
    message: "Submission triggered asynchronously. Check scoring_batches table for result.",
  });
}
