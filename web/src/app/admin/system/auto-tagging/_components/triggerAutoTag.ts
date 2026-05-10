"use server";
import { revalidatePath } from "next/cache";

export async function triggerAutoTag(job: "specialty" | "article-type") {
  const route = job === "specialty"
    ? "/api/cron/auto-tag-specialty"
    : "/api/cron/auto-tag-article-type";

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

  if (!res.ok) throw new Error(`Manual ${job} trigger failed: ${res.status}`);

  revalidatePath(`/admin/system/auto-tagging/${job === "specialty" ? "specialty" : "article-type"}`);
  return await res.json();
}
