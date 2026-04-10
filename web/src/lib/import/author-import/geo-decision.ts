import { createAdminClient } from "@/lib/supabase/admin";

export async function fetchRorGeo(
  rorId: string
): Promise<{ city: string | null; state: string | null; country: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("ror_institutions")
    .select("city, state, country")
    .eq("ror_id", rorId)
    .maybeSingle();

  if (!data) {
    console.warn(`[fetchRorGeo] ror_id ikke fundet i ror_institutions: ${rorId}`);
    return { city: null, state: null, country: null };
  }

  return {
    city:    data.city    ?? null,
    state:   data.state   ?? null,
    country: data.country ?? null,
  };
}

export function isGeoUpgrade(
  existing: { city: string | null; country: string | null; hospital: string | null },
  parsed: { city: string | null; country: string | null; institution: string | null },
): boolean {
  if (!existing.country && parsed.country) return true;
  if (!existing.city && parsed.city) return true;
  if (existing.city && parsed.city) {
    const INST_WORDS = ["university", "hospital", "institute", "college", "school",
      "center", "centre", "clinic", "department", "faculty"];
    const oldHasInst = INST_WORDS.some(w => existing.city!.toLowerCase().includes(w));
    const newHasInst = INST_WORDS.some(w => parsed.city!.toLowerCase().includes(w));
    if (oldHasInst && !newHasInst) return true;
  }
  return false;
}
