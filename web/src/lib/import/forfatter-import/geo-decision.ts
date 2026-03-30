// Hent by/stat/land fra ROR geonames_details for et givet ROR-id (uden prefix)
export async function fetchRorGeo(
  rorId: string
): Promise<{ city: string | null; state: string | null; country: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`https://api.ror.org/organizations/${rorId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { city: null, state: null, country: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const geo = data.locations?.[0]?.geonames_details;
    return {
      city:    geo?.name                     ?? null,
      state:   geo?.country_subdivision_name ?? null,
      country: geo?.country_name             ?? null,
    };
  } catch {
    clearTimeout(timeout);
    return { city: null, state: null, country: null };
  }
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
