import { createAdminClient } from "@/lib/supabase/admin";
import type { NightlyFlowReport } from "./types";

export async function fetchNightlyFlowReport(date: string): Promise<NightlyFlowReport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_nightly_flow_report", { p_date: date });
  if (error) throw new Error(`Nightly flow report failed: ${error.message}`);
  return data as NightlyFlowReport;
}
