import { createAdminClient } from "@/lib/supabase/admin";
import SystemCards from "./SystemCards";

export default async function SystemPage() {
  const admin = createAdminClient();

  const { count } = await admin
    .from("system_alerts" as never)
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  return <SystemCards hasAlerts={(count ?? 0) > 0} />;
}
