import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

function weekStart(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [weekRows, monthRows, allRows, dailyRows] = await Promise.all([
    admin.from("api_usage").select("model_key, total_tokens, cost_usd").gte("called_at", weekStart()),
    admin.from("api_usage").select("cost_usd").gte("called_at", monthStart()),
    admin.from("api_usage").select("cost_usd"),
    admin.from("api_usage").select("model_key, total_tokens, cost_usd, called_at").gte("called_at", thirtyDaysAgo()).order("called_at", { ascending: true }),
  ]);

  // Per-model aggregation for this week
  const byModel: Record<string, { tokens: number; cost: number }> = {};
  for (const row of weekRows.data ?? []) {
    const k = row.model_key as string;
    if (!byModel[k]) byModel[k] = { tokens: 0, cost: 0 };
    byModel[k].tokens += (row.total_tokens as number) ?? 0;
    byModel[k].cost   += Number(row.cost_usd ?? 0);
  }

  const costThisWeek  = (weekRows.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const costThisMonth = (monthRows.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const costAllTime   = (allRows.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  // Estimated monthly based on daily average this month
  const daysElapsed = Math.max(1, new Date().getUTCDate());
  const daysInMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate();
  const estMonthly  = (costThisMonth / daysElapsed) * daysInMonth;

  // Daily breakdown (last 30 days), grouped by date
  const dailyMap: Record<string, { tokens: number; cost: number }> = {};
  for (const row of dailyRows.data ?? []) {
    const date = (row.called_at as string).slice(0, 10); // YYYY-MM-DD
    if (!dailyMap[date]) dailyMap[date] = { tokens: 0, cost: 0 };
    dailyMap[date].tokens += (row.total_tokens as number) ?? 0;
    dailyMap[date].cost   += Number(row.cost_usd ?? 0);
  }
  const daily = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    ok: true,
    costThisWeek,
    costThisMonth,
    costAllTime,
    estMonthly,
    byModel,
    daily,
  });
}
