"use server";
import { revalidatePath } from "next/cache";

export async function triggerBackgroundCron(job: "poll" | "ingest") {
  const route = job === "poll"
    ? "/api/cron/scoring-batch-poll"
    : "/api/cron/scoring-batch-ingest";

  const base = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) throw new Error(`Manual ${job} failed: ${res.status}`);

  revalidatePath("/admin/system/scoring/background");
  return await res.json();
}
