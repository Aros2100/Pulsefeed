import { createAdminClient } from "@/lib/supabase/admin";
import CostChart from "./CostChart";

export const dynamic = "force-dynamic";

const BASELINE = "2026-03-17T00:00:00Z";

function todayStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function weekStart(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

type DashRow = {
  task:     string;
  is_lab:   boolean;
  is_batch: boolean;
  lab_step: string | null;
  forbrug:  number;
  artikler: number;
  kald:     number;
};

export type PeriodData = {
  rows: DashRow[];
};

export default async function CostPage() {
  const admin = createAdminClient();

  const since = (ts: string) => new Date(ts) > new Date(BASELINE) ? ts : BASELINE;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (admin as any).rpc.bind(admin) as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
  const [{ data: todayRows }, { data: weekRows }, { data: monthRows }, { data: allRows }] = await Promise.all([
    rpc("get_cost_dashboard", { since_ts: since(todayStart()) }),
    rpc("get_cost_dashboard", { since_ts: since(weekStart()) }),
    rpc("get_cost_dashboard", { since_ts: since(monthStart()) }),
    rpc("get_cost_dashboard", { since_ts: BASELINE }),
  ]);

  return (
    <CostChart
      today={(todayRows ?? []) as DashRow[]}
      week={(weekRows   ?? []) as DashRow[]}
      month={(monthRows ?? []) as DashRow[]}
      all={(allRows     ?? []) as DashRow[]}
    />
  );
}
