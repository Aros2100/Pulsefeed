import { getRegion, getContinent } from "./continent-map";

export interface UserGeo {
  continent: string | null;
  region: string | null;
  country: string;
  city: string | null;
  hospital: string | null;
}

export function getUserGeo(
  country: string | null,
  city: string | null,
  hospital: string | null,
): UserGeo | null {
  if (!country) return null;
  const region = getRegion(country);
  const continent = region ? getContinent(region) : null;
  return { continent, region, country, city, hospital };
}
