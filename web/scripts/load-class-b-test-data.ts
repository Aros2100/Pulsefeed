/**
 * Hent 1000 friske Klasse B-kandidat-artikler (affiliation indeholder semikolon)
 * og insert dem i geo_parser_b_run_1000 med parser_status = 'pending'.
 *
 * Undgår overlap med geo_parser_run_1000 (v1-test-data).
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/load-class-b-test-data.ts
 */

import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

const LIMIT = 1000;
const INSERT_BATCH = 100;

async function main() {
  // ── 1. Hent eksisterende pubmed_ids i v1-test-data ───────────────────────
  console.log("Henter eksisterende v1-test pubmed_ids...");
  const { data: v1Rows, error: v1Err } = await db
    .from("geo_parser_run_1000")
    .select("pubmed_id");
  if (v1Err) throw new Error(`v1 fetch error: ${v1Err.message}`);
  const v1Ids = new Set((v1Rows as Array<{ pubmed_id: string }>).map((r) => r.pubmed_id));
  console.log(`  ${v1Ids.size} v1-artikler fundet.`);

  // ── 2. Hent kandidater fra articles ──────────────────────────────────────
  // Fetch in batches to avoid large response; filter client-side for semicolon
  // and v1-overlap, then take first LIMIT.
  console.log("Henter kandidater fra articles (affiliation med semikolon)...");

  const candidates: Array<{ pubmed_id: string; affiliation: string }> = [];
  let offset = 0;
  const FETCH_BATCH = 2000;

  while (candidates.length < LIMIT) {
    const { data, error } = await db
      .from("articles")
      .select("pubmed_id, authors")
      .not("authors", "is", null)
      .range(offset, offset + FETCH_BATCH - 1)
      .order("pubmed_id", { ascending: true });

    if (error) throw new Error(`articles fetch error: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Array<{ pubmed_id: string; authors: unknown }>) {
      if (candidates.length >= LIMIT) break;
      if (v1Ids.has(row.pubmed_id)) continue;

      // Extract first author's first affiliation
      let aff: string | null = null;
      try {
        const authors = row.authors as Array<{ affiliations?: string[] }>;
        aff = authors?.[0]?.affiliations?.[0] ?? null;
      } catch {
        continue;
      }

      if (!aff || !aff.includes(";")) continue;
      candidates.push({ pubmed_id: row.pubmed_id, affiliation: aff });
    }

    process.stdout.write(
      `\r  Skannet: ${offset + data.length}, kandidater: ${candidates.length}/${LIMIT}     `
    );

    if (data.length < FETCH_BATCH) break;
    offset += FETCH_BATCH;
  }
  console.log(`\n  Fundet ${candidates.length} kandidater.`);

  if (candidates.length === 0) {
    console.log("Ingen kandidater — stopper.");
    return;
  }

  // Shuffle for randomness (md5-stable sort approximation client-side)
  candidates.sort((a, b) => {
    const ha = simpleHash(a.pubmed_id + "class_b_test_seed");
    const hb = simpleHash(b.pubmed_id + "class_b_test_seed");
    return ha - hb;
  });
  const selected = candidates.slice(0, LIMIT);

  // ── 3. Ryd eksisterende data (idempotent re-run) ─────────────────────────
  console.log("Rydder eksisterende geo_parser_b_run_1000...");
  const { error: delErr } = await db.from("geo_parser_b_run_1000").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw new Error(`delete error: ${delErr.message}`);

  // ── 4. Insert i batches ───────────────────────────────────────────────────
  console.log(`Inserter ${selected.length} artikler...`);
  let inserted = 0;

  for (let i = 0; i < selected.length; i += INSERT_BATCH) {
    const batch = selected.slice(i, i + INSERT_BATCH).map((r) => ({
      pubmed_id:     r.pubmed_id,
      affiliation:   r.affiliation,
      parser_status: "pending",
    }));

    const { error: insErr } = await db.from("geo_parser_b_run_1000").insert(batch);
    if (insErr) throw new Error(`insert error at offset ${i}: ${insErr.message}`);
    inserted += batch.length;
    process.stdout.write(`\r  Inserted: ${inserted}/${selected.length}     `);
  }
  console.log(`\nFærdig. ${inserted} artikler indlæst i geo_parser_b_run_1000.`);
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
