import { lookupCity } from "@/lib/geo/city-map";

function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeGeo(
  city: string | null,
  country: string | null,
): { city: string | null; country: string | null } {
  if (!city) return { city: null, country: country ?? null };

  const cityKey = unaccent(city).toLowerCase();
  const info = lookupCity(cityKey);

  if (info) {
    return {
      city: info.city,
      country: country ?? info.country,
    };
  }

  return { city, country: country ?? null };
}
