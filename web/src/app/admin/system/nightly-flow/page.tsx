export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fetchNightlyFlowReport } from "./_lib/fetchReport";
import { NightlyFlowClient } from "./_components/NightlyFlowClient";

function defaultDate(): string {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0));
  const target = now < cutoff ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  return target.toISOString().slice(0, 10);
}

export default async function NightlyFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/login");

  const params = await searchParams;
  const date = params.date ?? defaultDate();
  const report = await fetchNightlyFlowReport(date);

  return <NightlyFlowClient initialDate={date} initialReport={report} />;
}
