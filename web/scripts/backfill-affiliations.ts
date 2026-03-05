/**
 * backfill-affiliations.ts
 *
 * Genberegner department, hospital, city, country for alle forfattere
 * med en rå affiliations[] streng ved at køre parseAffiliation().
 *
 * Kør fra web/:
 *   npx tsx scripts/backfill-affiliations.ts --dry-run   (tæl ændringer, skriv ikke)
 *   npx tsx scripts/backfill-affiliations.ts             (udfør opdateringer)
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

// ── Args ───────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");

// ── Supabase ───────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local");
  process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient<any>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// ── Types ──────────────────────────────────────────────────────────────────
type AuthorRow = {
  id: string;
  department: string | null;
  hospital: string | null;
  city: string | null;
  country: string | null;
  affiliations: string[] | null;
};

type UpdatePayload = {
  department: string | null;
  hospital: string | null;
  city: string | null;
  country: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function normalize(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function hasChanged(current: AuthorRow, next: UpdatePayload): boolean {
  return (
    normalize(current.department) !== normalize(next.department) ||
    normalize(current.hospital)   !== normalize(next.hospital)   ||
    normalize(current.city)       !== normalize(next.city)       ||
    normalize(current.country)    !== normalize(next.country)
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
const PAGE_SIZE = 1000;
const BATCH_SIZE = 100; // antal updates per upsert-kald

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (ingen ændringer skrives)" : "LIVE (opdaterer DB)"}`);
  console.log("Henter forfattere…\n");

  let page = 0;
  let totalFetched = 0;
  let totalChanged = 0;
  let totalSkipped = 0;
  let totalUpdated = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    const { data, error } = await db
      .from("authors")
      .select("id, department, hospital, city, country, affiliations")
      .not("affiliations", "is", null)
      .range(from, to);

    if (error) {
      console.error("DB fejl:", error.message);
      process.exit(1);
    }

    const rows = (data as AuthorRow[]).filter(
      (r) => Array.isArray(r.affiliations) && r.affiliations.length > 0 && r.affiliations[0]?.trim()
    );

    if (rows.length === 0) break;

    totalFetched += rows.length;

    // Beregn nye værdier og saml ændringer
    const updates: ({ id: string } & UpdatePayload)[] = [];

    for (const r of rows) {
      const parsed = parseAffiliation(r.affiliations);
      const next: UpdatePayload = {
        department: parsed.department,
        hospital:   parsed.hospital,
        city:       parsed.city,
        country:    parsed.country,
      };

      if (hasChanged(r, next)) {
        totalChanged++;
        updates.push({ id: r.id, ...next });
      } else {
        totalSkipped++;
      }
    }

    // Udfør updates i parallelle batches
    if (!DRY_RUN && updates.length > 0) {
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((u) =>
            db
              .from("authors")
              .update({
                department: u.department,
                hospital:   u.hospital,
                city:       u.city,
                country:    u.country,
              })
              .eq("id", u.id)
          )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          console.error(`Fejl ved update:`, failed.error.message);
          process.exit(1);
        }
        totalUpdated += batch.length;
      }
    }

    process.stdout.write(
      `\rSide ${page + 1}: ${totalFetched} hentet, ${totalChanged} ændrede, ${totalSkipped} uændrede…`
    );

    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  // ── Sammenfatning ──────────────────────────────────────────────────────
  console.log("\n");
  console.log("── Sammenfatning ──────────────────────────────────────");
  console.log(`Forfattere hentet    : ${totalFetched}`);
  console.log(`Med ændringer        : ${totalChanged}`);
  console.log(`Allerede korrekte    : ${totalSkipped}`);
  if (DRY_RUN) {
    console.log(`\nDRY RUN — ingen ændringer skrevet.`);
    console.log(`Kør uden --dry-run for at opdatere ${totalChanged} forfattere.`);
  } else {
    console.log(`Opdateret i DB       : ${totalUpdated}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
