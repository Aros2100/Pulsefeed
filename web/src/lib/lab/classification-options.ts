import { createAdminClient } from "@/lib/supabase/admin";

export async function getSubspecialties(specialty: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("subspecialties")
    .select("name")
    .eq("specialty", specialty)
    .eq("active", true)
    .order("sort_order");
  return (data ?? []).map((r: { name: string }) => r.name);
}
