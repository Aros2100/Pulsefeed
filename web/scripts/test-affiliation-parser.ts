/**
 * test-affiliation-parser.ts
 *
 * Henter 50 tilfældige forfattere med affiliations fra DB,
 * kører parseAffiliation() og sammenligner med lagrede værdier.
 *
 * Kør fra web/:
 *   npx tsx scripts/test-affiliation-parser.ts
 *   npx tsx scripts/test-affiliation-parser.ts > output.csv
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { parseAffiliation } from "../src/lib/affiliations";

// ── Load .env.local ────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !process.env[key]) process.env[key] = val;
}

// ── Supabase client ────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local");
  process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient<any>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// ── Helpers ────────────────────────────────────────────────────────────────
function csvEscape(v: string | null | undefined): string {
  const s = v ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function diff(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() !== (b ?? "").trim().toLowerCase();
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  // Fetch 400 authors with affiliations, then sample 50 randomly
  const { data, error } = await db
    .from("authors")
    .select("id, display_name, department, hospital, city, country, affiliations")
    .not("affiliations", "is", null)
    .limit(400);

  if (error) {
    console.error("DB fejl:", error.message);
    process.exit(1);
  }

  type AuthorRow = {
    id: string;
    display_name: string | null;
    department: string | null;
    hospital: string | null;
    city: string | null;
    country: string | null;
    affiliations: string[] | null;
  };

  const rows = (data as AuthorRow[]).filter(
    (r) => Array.isArray(r.affiliations) && r.affiliations.length > 0 && r.affiliations[0]?.trim()
  );

  // Random sample of 50
  const shuffled = rows.sort(() => Math.random() - 0.5).slice(0, 50);

  // ── CSV header ─────────────────────────────────────────────────────────
  const headers = [
    "forfatter_navn",
    "rå_affiliation",
    "nuværende_dept",
    "ny_dept",
    "nuværende_hospital",
    "nyt_hospital",
    "nuværende_city",
    "ny_city",
    "nuværende_country",
    "nyt_country",
    "ændret",
  ];
  console.log(headers.join(","));

  let changedCount = 0;

  for (const r of shuffled) {
    const raw = r.affiliations![0];
    const parsed = parseAffiliation([raw]);

    const changed =
      diff(r.department, parsed.department) ||
      diff(r.hospital, parsed.hospital) ||
      diff(r.city, parsed.city) ||
      diff(r.country, parsed.country);

    if (changed) changedCount++;

    const cols = [
      r.display_name,
      raw,
      r.department,
      parsed.department,
      r.hospital,
      parsed.hospital,
      r.city,
      parsed.city,
      r.country,
      parsed.country,
      changed ? "ja" : "nej",
    ].map(csvEscape);

    console.log(cols.join(","));
  }

  // Summary to stderr so it doesn't pollute CSV
  console.error(`\n── Sammenfatning ──────────────────────────`);
  console.error(`Forfattere analyseret : ${shuffled.length}`);
  console.error(`Med ændringer         : ${changedCount}`);
  console.error(`Uden ændringer        : ${shuffled.length - changedCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
