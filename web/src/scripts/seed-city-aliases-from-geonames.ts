/**
 * seed-city-aliases-from-geonames.ts
 *
 * Seeds city_aliases with alternate-name mappings from GeoNames cities15000
 * (all cities with population > 15,000).
 *
 * For each city, every alternate name that differs from the canonical GeoNames
 * name is inserted as an alias. Only cities belonging to countries present in
 * our articles DB are processed.
 *
 * Existing aliases are never overwritten (ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   cd web && npx tsx src/scripts/seed-city-aliases-from-geonames.ts
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, createReadStream } from "fs";
import { createInterface } from "readline";
import { execSync } from "child_process";
import * as os from "os";
import * as path from "path";

// Load .env.local before any imports that need DB credentials.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !process.env[key]) process.env[key] = val;
}

import { createAdminClient } from "@/lib/supabase/admin";

// ── ISO 3166-1 alpha-2 → canonical country name ───────────────────────────────
// Matches the geo_country values stored in articles.geo_country.
const ISO_TO_COUNTRY: Record<string, string> = {
  // Scandinavia
  DK: "Denmark",        SE: "Sweden",      NO: "Norway",
  FI: "Finland",        IS: "Iceland",
  // Western Europe
  GB: "United Kingdom", IE: "Ireland",     FR: "France",
  BE: "Belgium",        NL: "Netherlands", LU: "Luxembourg",
  CH: "Switzerland",    AT: "Austria",     DE: "Germany",
  // Southern Europe
  ES: "Spain",          PT: "Portugal",    IT: "Italy",
  GR: "Greece",         MT: "Malta",       CY: "Cyprus",
  AD: "Andorra",        MC: "Monaco",      SM: "San Marino",
  VA: "Vatican City",
  // Eastern Europe
  PL: "Poland",         CZ: "Czech Republic", SK: "Slovakia",
  HU: "Hungary",        RO: "Romania",     BG: "Bulgaria",
  RS: "Serbia",         HR: "Croatia",     SI: "Slovenia",
  BA: "Bosnia and Herzegovina", ME: "Montenegro", MK: "North Macedonia",
  AL: "Albania",        XK: "Kosovo",      MD: "Moldova",
  UA: "Ukraine",        BY: "Belarus",     LT: "Lithuania",
  LV: "Latvia",         EE: "Estonia",     GE: "Georgia",
  // Russia & Central Asia
  RU: "Russia",         KZ: "Kazakhstan",  UZ: "Uzbekistan",
  TM: "Turkmenistan",   TJ: "Tajikistan",  KG: "Kyrgyzstan",
  MN: "Mongolia",       AM: "Armenia",     AZ: "Azerbaijan",
  // North America
  US: "United States",  CA: "Canada",
  // Central America & Caribbean
  MX: "Mexico",         GT: "Guatemala",   BZ: "Belize",
  HN: "Honduras",       SV: "El Salvador", NI: "Nicaragua",
  CR: "Costa Rica",     PA: "Panama",      CU: "Cuba",
  JM: "Jamaica",        HT: "Haiti",       DO: "Dominican Republic",
  TT: "Trinidad and Tobago", BB: "Barbados", BS: "Bahamas",
  CW: "Curaçao",        PR: "Puerto Rico",
  // South America
  BR: "Brazil",         AR: "Argentina",   CL: "Chile",
  CO: "Colombia",       PE: "Peru",        VE: "Venezuela",
  EC: "Ecuador",        BO: "Bolivia",     PY: "Paraguay",
  UY: "Uruguay",        GY: "Guyana",      SR: "Suriname",
  // Middle East
  TR: "Turkey",         IR: "Iran",        IQ: "Iraq",
  SA: "Saudi Arabia",   AE: "United Arab Emirates", QA: "Qatar",
  BH: "Bahrain",        KW: "Kuwait",      OM: "Oman",
  YE: "Yemen",          JO: "Jordan",      LB: "Lebanon",
  IL: "Israel",         SY: "Syria",       PS: "Palestine",
  // North Africa
  EG: "Egypt",          LY: "Libya",       TN: "Tunisia",
  DZ: "Algeria",        MA: "Morocco",     SD: "Sudan",
  // Sub-Saharan Africa
  NG: "Nigeria",        ZA: "South Africa", KE: "Kenya",
  ET: "Ethiopia",       GH: "Ghana",       TZ: "Tanzania",
  UG: "Uganda",         CM: "Cameroon",    SN: "Senegal",
  CD: "Democratic Republic of the Congo", MZ: "Mozambique",
  ZW: "Zimbabwe",       ZM: "Zambia",      RW: "Rwanda",
  CI: "Ivory Coast",    MG: "Madagascar",  AO: "Angola",
  BW: "Botswana",       NA: "Namibia",     ML: "Mali",
  BF: "Burkina Faso",   NE: "Niger",       GN: "Guinea",
  BJ: "Benin",          TG: "Togo",        SL: "Sierra Leone",
  LR: "Liberia",        MR: "Mauritania",  ER: "Eritrea",
  SO: "Somalia",        MW: "Malawi",      GM: "Gambia",
  LS: "Lesotho",        SZ: "Eswatini",    MU: "Mauritius",
  CV: "Cape Verde",     KM: "Comoros",     DJ: "Djibouti",
  GQ: "Equatorial Guinea", GA: "Gabon",   ST: "São Tomé and Príncipe",
  SC: "Seychelles",     CF: "Central African Republic", SS: "South Sudan",
  TD: "Chad",           CG: "Republic of the Congo", BI: "Burundi",
  // South Asia
  IN: "India",          PK: "Pakistan",    BD: "Bangladesh",
  LK: "Sri Lanka",      NP: "Nepal",       BT: "Bhutan",
  AF: "Afghanistan",    MV: "Maldives",
  // East Asia
  CN: "China",          JP: "Japan",       KR: "South Korea",
  KP: "North Korea",    TW: "Taiwan",      HK: "Hong Kong",
  MO: "Macau",
  // Southeast Asia
  TH: "Thailand",       VN: "Vietnam",     ID: "Indonesia",
  PH: "Philippines",    MY: "Malaysia",    SG: "Singapore",
  MM: "Myanmar",        KH: "Cambodia",    LA: "Laos",
  BN: "Brunei",         TL: "East Timor",
  // Oceania
  AU: "Australia",      NZ: "New Zealand", PG: "Papua New Guinea",
  FJ: "Fiji",           WS: "Samoa",       TO: "Tonga",
  VU: "Vanuatu",        SB: "Solomon Islands", FM: "Micronesia",
  KI: "Kiribati",       MH: "Marshall Islands", PW: "Palau",
  TV: "Tuvalu",         NR: "Nauru",
};

const GEONAMES_URL = "https://download.geonames.org/export/dump/cities15000.zip";
const BATCH_SIZE = 1000;
const DRY_RUN = process.argv.includes("--dry-run");
const DEBUG_ISOS = ["US", "CN", "DK", "FR", "DE"];

// ── Filters ───────────────────────────────────────────────────────────────────

/** True if the string looks like a postal/zip code, not a city name. */
function isPostalCode(s: string): boolean {
  if (/^\d+$/.test(s)) return true;                                    // pure digits
  if (/^\d{2,3}-\d{2,4}$/.test(s)) return true;                       // "71-252"
  if (/^[A-Z]{1,2}[-\s]?\d{3,6}$/i.test(s)) return true;             // "DK-2100", "F-69008"
  if (/^\d{3,5}\s+[A-Z]{1,3}$/i.test(s)) return true;                 // "2300 RC"
  if (/^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i.test(s)) return true;            // Canadian "H3T 1P1"
  if (/^[A-Z]{2}\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i.test(s)) return true; // "QC H3T 1P1"
  return false;
}

/** True if the string is a non-city code (WikiData ID, IATA airport code, etc.). */
function isNonCityCode(s: string): boolean {
  if (/^Q\d+$/.test(s)) return true;          // WikiData: "Q90", "Q1726"
  if (/^[A-Z]{3}$/.test(s)) return true;      // IATA 3-letter codes
  if (/^[A-Z]{2}-\d{2}$/.test(s)) return true; // Admin-code format "FR-75"
  return false;
}

// ── Batch insert ──────────────────────────────────────────────────────────────

type AliasRow = { alias: string; canonical: string; country: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertBatch(db: any, rows: AliasRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("city_aliases")
    .upsert(rows, { onConflict: "alias,country", ignoreDuplicates: true });
  if (error) {
    console.error("  Batch insert error:", error.message);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Step 1: Use all countries from ISO_TO_COUNTRY map.
  // (Querying articles.geo_country is unreliable due to PostgREST row limits.)
  const activeIso = new Set(Object.keys(ISO_TO_COUNTRY));
  console.log(`[seed-city-aliases] Processing all ${activeIso.size} ISO codes from map`);
  console.log(`  Active ISO codes: ${[...activeIso].sort().join(", ")}`);

  console.log("\n[seed-city-aliases] Debug — key country mapping:");
  for (const iso of DEBUG_ISOS) {
    const name = ISO_TO_COUNTRY[iso];
    console.log(`  ${iso} → "${name ?? "(not in map)"}" | in activeIso: ${activeIso.has(iso)}`);
  }

  if (DRY_RUN) {
    console.log("\n[seed-city-aliases] DRY-RUN mode — DB inserts will be skipped");
  }

  // Step 2: Download and extract GeoNames dataset.
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "geonames-"));
  const zipPath = path.join(tmpDir, "cities15000.zip");
  const txtPath = path.join(tmpDir, "cities15000.txt");

  try {
    console.log(`\n[seed-city-aliases] Downloading ${GEONAMES_URL}...`);
    const res = await fetch(GEONAMES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const buf = await res.arrayBuffer();
    writeFileSync(zipPath, Buffer.from(buf));
    console.log(`  ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB downloaded`);

    execSync(`unzip -o "${zipPath}" cities15000.txt -d "${tmpDir}"`, { stdio: "pipe" });
    console.log("  Extracted cities15000.txt");

    // Step 3: Parse TSV — GeoNames column layout:
    //   0: geonameid  1: name  2: asciiname  3: alternatenames (comma-sep)
    //   4: latitude   5: longitude  6: feature class  7: feature code
    //   8: country code (ISO-2)  ...
    console.log("\n[seed-city-aliases] Parsing and inserting aliases...");

    let linesRead = 0;
    let rowsAttempted = 0;
    let rowsSkipped = 0;
    let batchesSent = 0;
    const batch: AliasRow[] = [];
    const debugCityCounts: Record<string, number> = {};

    const rl = createInterface({
      input: createReadStream(txtPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      linesRead++;
      const cols = line.split("\t");
      if (cols.length < 9) continue;

      const name      = cols[1]?.trim() ?? "";
      const asciiname = cols[2]?.trim() ?? "";
      const altNames  = cols[3]?.trim() ?? "";
      const isoCode   = cols[8]?.trim().toUpperCase() ?? "";

      if (!name || !isoCode || !activeIso.has(isoCode)) continue;
      const country = ISO_TO_COUNTRY[isoCode]!;

      if (DEBUG_ISOS.includes(isoCode)) {
        debugCityCounts[isoCode] = (debugCityCounts[isoCode] ?? 0) + 1;
      }

      // Collect candidate aliases: asciiname + all comma-separated alternatenames.
      const candidates = new Set<string>();
      if (asciiname && asciiname !== name) candidates.add(asciiname);
      for (const v of altNames.split(",")) {
        const t = v.trim();
        if (t) candidates.add(t);
      }

      for (const variant of candidates) {
        if (variant === name) continue;
        if (variant.length < 2) { rowsSkipped++; continue; }
        if (isPostalCode(variant)) { rowsSkipped++; continue; }
        if (isNonCityCode(variant)) { rowsSkipped++; continue; }
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x1F\x7F]/.test(variant)) { rowsSkipped++; continue; }

        batch.push({ alias: variant, canonical: name, country });
        rowsAttempted++;

        if (batch.length >= BATCH_SIZE) {
          if (!DRY_RUN) await insertBatch(db, batch);
          batchesSent++;
          batch.length = 0;
          if (batchesSent % 20 === 0) {
            process.stdout.write(
              `  ${rowsAttempted.toLocaleString()} rows attempted (${batchesSent} batches)...\r`
            );
          }
        }
      }
    }

    // Flush remaining batch.
    if (batch.length > 0) {
      if (!DRY_RUN) await insertBatch(db, batch);
      batchesSent++;
    }

    console.log("\n[seed-city-aliases] Debug — cities found per key ISO:");
    for (const iso of DEBUG_ISOS) {
      console.log(`  ${iso} (${ISO_TO_COUNTRY[iso]}): ${(debugCityCounts[iso] ?? 0).toLocaleString()} cities`);
    }

    console.log(`\n\n[seed-city-aliases] Done${DRY_RUN ? " (DRY-RUN — nothing inserted)" : ""}`);
    console.log(`  Lines read     : ${linesRead.toLocaleString()}`);
    console.log(`  Rows attempted : ${rowsAttempted.toLocaleString()}`);
    console.log(`  Rows skipped   : ${rowsSkipped.toLocaleString()}`);
    console.log(`  Batches sent   : ${batchesSent}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[seed-city-aliases] Unhandled error:", err);
  process.exit(1);
});
