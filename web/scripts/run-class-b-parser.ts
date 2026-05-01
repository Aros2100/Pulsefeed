/**
 * Kør Klasse B-parseren på alle 'pending' artikler i geo_parser_b_run_1000.
 * Skriver adresse-rows til geo_addresses_lab og opdaterer parser_status.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/run-class-b-parser.ts
 */

import { createClient } from "@supabase/supabase-js";
import { parseClassB } from "../src/admin/lab/geo-validation/parser-class-b/affiliation-parser-b";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

const BATCH_SIZE = 50;

async function main() {
  // ── 1. Hent pending artikler ──────────────────────────────────────────────
  console.log("Henter pending artikler fra geo_parser_b_run_1000...");
  const { data, error } = await db
    .from("geo_parser_b_run_1000")
    .select("pubmed_id, affiliation")
    .eq("parser_status", "pending")
    .order("pubmed_id", { ascending: true });

  if (error || !data) throw new Error(error?.message ?? "no data");
  const rows = data as Array<{ pubmed_id: string; affiliation: string }>;
  console.log(`  ${rows.length} pending artikler.\n`);

  let parsed   = 0;
  let rejected = 0;
  let errors   = 0;
  let totalAddressRows = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (row) => {
      const now = new Date().toISOString();
      let result: Awaited<ReturnType<typeof parseClassB>>;

      try {
        result = await parseClassB(row.affiliation);
      } catch (e) {
        errors++;
        await db.from("geo_parser_b_run_1000").update({
          parser_run_at: now,
          parser_status: "error",
          parser_error:  (e as Error).message,
          num_addresses: 0,
        }).eq("pubmed_id", row.pubmed_id);
        return;
      }

      if (result === null) {
        rejected++;
        await db.from("geo_parser_b_run_1000").update({
          parser_run_at: now,
          parser_status: "rejected",
          num_addresses: 0,
        }).eq("pubmed_id", row.pubmed_id);
        return;
      }

      // Delete any existing address rows (idempotent)
      await db.from("geo_addresses_lab").delete().eq("pubmed_id", row.pubmed_id);

      // Insert address rows
      const insertRows = result.map((addr) => ({
        pubmed_id:             row.pubmed_id,
        position:              addr.position,
        city:                  addr.city,
        state:                 addr.state,
        country:               addr.country,
        institution:           addr.institution,
        institution2:          addr.institution2,
        institution3:          addr.institution3,
        institutions_overflow: addr.institutions_overflow,
        department:            addr.department,
        department2:           addr.department2,
        department3:           addr.department3,
        departments_overflow:  addr.departments_overflow,
        confidence:            addr.confidence,
      }));

      const { error: insErr } = await db.from("geo_addresses_lab").insert(insertRows);
      if (insErr) {
        errors++;
        await db.from("geo_parser_b_run_1000").update({
          parser_run_at: now,
          parser_status: "error",
          parser_error:  insErr.message,
          num_addresses: 0,
        }).eq("pubmed_id", row.pubmed_id);
        return;
      }

      parsed++;
      totalAddressRows += result.length;
      await db.from("geo_parser_b_run_1000").update({
        parser_run_at: now,
        parser_status: "parsed",
        num_addresses: result.length,
      }).eq("pubmed_id", row.pubmed_id);
    }));

    process.stdout.write(
      `\r  [${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}]  parsed=${parsed}  rejected=${rejected}  errors=${errors}     `
    );
  }
  console.log("\nParser-kørsel færdig.");

  // ── 2. Aggregat-rapport ───────────────────────────────────────────────────
  console.log(`\n── Overordnet rapport ──`);
  console.log(`  Total:          ${rows.length}`);
  console.log(`  Klasse B:       ${parsed}`);
  console.log(`  Rejected:       ${rejected}`);
  console.log(`  Errors:         ${errors}`);
  console.log(`  Address-rows:   ${totalAddressRows}`);
  if (parsed > 0) {
    console.log(`  Avg addresses:  ${(totalAddressRows / parsed).toFixed(2)}`);
  }

  // ── 3. Fordeling (num_addresses) ─────────────────────────────────────────
  console.log("\n── Fordeling (rows per artikel) ──");
  const { data: dist } = await db
    .from("geo_parser_b_run_1000")
    .select("num_addresses")
    .eq("parser_status", "parsed");

  if (dist) {
    const counts = new Map<number, number>();
    for (const r of dist as Array<{ num_addresses: number }>) {
      counts.set(r.num_addresses, (counts.get(r.num_addresses) ?? 0) + 1);
    }
    for (const [n, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  ${n} addresses: ${c} artikler`);
    }
  }

  // ── 4. Dækning på adresse-rows ────────────────────────────────────────────
  console.log("\n── Dækning (adresse-rows for nye artikler) ──");
  const { data: addrRows } = await db
    .from("geo_addresses_lab")
    .select("country, state, city, institution, confidence, pubmed_id");

  // Filter to only new articles (those in geo_parser_b_run_1000)
  const { data: newPubmedIds } = await db
    .from("geo_parser_b_run_1000")
    .select("pubmed_id")
    .eq("parser_status", "parsed");

  if (addrRows && newPubmedIds) {
    const newIds = new Set((newPubmedIds as Array<{ pubmed_id: string }>).map((r) => r.pubmed_id));
    const rows2 = (addrRows as Array<{
      pubmed_id: string; country: string | null; state: string | null;
      city: string | null; institution: string | null; confidence: string | null;
    }>).filter((r) => newIds.has(r.pubmed_id));

    const total = rows2.length;
    const hasCountry = rows2.filter((r) => r.country).length;
    const hasState   = rows2.filter((r) => r.state).length;
    const hasCity    = rows2.filter((r) => r.city).length;
    const hasInst    = rows2.filter((r) => r.institution).length;
    const confHigh   = rows2.filter((r) => r.confidence === "high").length;

    console.log(`  Total rows:   ${total}`);
    console.log(`  Has country:  ${hasCountry}  (${pct(hasCountry, total)})`);
    console.log(`  Has state:    ${hasState}  (${pct(hasState, total)})`);
    console.log(`  Has city:     ${hasCity}  (${pct(hasCity, total)})`);
    console.log(`  Has inst1:    ${hasInst}  (${pct(hasInst, total)})`);
    console.log(`  Conf high:    ${confHigh}  (${pct(confHigh, total)})`);

    // Country distribution
    console.log("\n── Country-fordeling (top 10) ──");
    const cmap = new Map<string, number>();
    for (const r of rows2) {
      const c = r.country ?? "(null)";
      cmap.set(c, (cmap.get(c) ?? 0) + 1);
    }
    const sorted = [...cmap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [country, cnt] of sorted) {
      console.log(`  ${country.padEnd(32)} ${cnt}`);
    }
  }
}

function pct(n: number, total: number): string {
  return total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`;
}

main().catch((e) => { console.error(e); process.exit(1); });
