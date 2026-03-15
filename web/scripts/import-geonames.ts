import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// ── ISO 2-letter → country name ─────────────────────────────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CN: "China", JP: "Japan", DE: "Germany", GB: "United Kingdom",
  FR: "France", IN: "India", CA: "Canada", AU: "Australia", IT: "Italy",
  ES: "Spain", KR: "South Korea", BR: "Brazil", NL: "Netherlands", SE: "Sweden",
  CH: "Switzerland", DK: "Denmark", NO: "Norway", FI: "Finland", AT: "Austria",
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

interface CityRow {
  geonameid: number;
  name: string;
  ascii_name: string;
  latitude: number;
  longitude: number;
  country_code: string;
  country: string;
  admin1_code: string;
  population: number;
  state: string | null;
}

async function main() {
  const citiesFile = process.argv[2];
  const admin1File = process.argv[3];
  if (!citiesFile || !admin1File) {
    console.error("Usage: npx tsx scripts/import-geonames.ts <cities5000.txt> <admin1CodesASCII.txt>");
    process.exit(1);
  }

  // ── Parse admin1CodesASCII.txt ────────────────────────────────────────────
  const admin1Map = new Map<string, string>();
  for (const line of readFileSync(admin1File, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 2) continue;
    admin1Map.set(cols[0], cols[1]);
  }
  console.log(`Admin1 entries: ${admin1Map.size}`);

  // ── Parse cities5000.txt ──────────────────────────────────────────────────
  const lines = readFileSync(citiesFile, "utf8").split("\n");
  const cities: CityRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 15) continue;

    const population = parseInt(cols[14], 10);
    if (isNaN(population) || population < 1000) continue;

    const country_code = cols[8];
    const admin1_code = cols[10];
    const state = admin1Map.get(`${country_code}.${admin1_code}`) ?? null;

    cities.push({
      geonameid: parseInt(cols[0], 10),
      name: cols[1],
      ascii_name: cols[2],
      latitude: parseFloat(cols[4]),
      longitude: parseFloat(cols[5]),
      country_code,
      country: getCountryName(country_code),
      admin1_code,
      population,
      state,
    });
  }

  console.log(`Total lines: ${lines.length}`);
  console.log(`Cities with population >= 1000: ${cities.length}`);
  const withState = cities.filter(c => c.state).length;
  console.log(`Cities with resolved state: ${withState} (${Math.round(withState / cities.length * 100)}%)`);

  console.log("\nFirst 5 with state:");
  for (const c of cities.filter(c => c.state).slice(0, 5)) {
    console.log(`  ${c.geonameid} | ${c.name} | ${c.country} (${c.country_code}) | state=${c.state} | pop=${c.population}`);
  }

  // ── Load .env.local ───────────────────────────────────────────────────────
  const envPath = resolve(process.cwd(), ".env.local");
  for (const ln of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = ln.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }

  // ── Supabase insert (all rows in batches of 1000) ──────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const BATCH_SIZE = 1000;
  let inserted = 0;
  let errors = 0;

  console.log(`\nInserting ${cities.length} rows in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < cities.length; i += BATCH_SIZE) {
    const batch = cities.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("geo_cities")
      .upsert(batch, { onConflict: "geonameid" });

    if (error) {
      console.error(`Batch ${i}–${i + batch.length} error: ${error.message}`);
      errors++;
    } else {
      inserted += batch.length;
    }

    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE || i + BATCH_SIZE >= cities.length) {
      console.log(`Imported ${inserted}/${cities.length}...`);
    }
  }

  console.log(`\nDone — inserted: ${inserted}, errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
