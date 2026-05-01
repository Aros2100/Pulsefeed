/**
 * Post-AI state-berigelse for geo_addresses_lab.
 *
 * Kører lookupStateByCity() på ai-processed rows og opdaterer ai_state
 * hvor det mangler. Rapporterer recovery (parser havde state, AI fjernede)
 * og discovery (begge var null, geo_cities kender den).
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/enrich-ai-state.ts
 */

import { createClient } from "@supabase/supabase-js";
import { lookupStateByCity } from "../src/admin/lab/geo-validation/parser/city-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

interface Row {
  pubmed_id:  string;
  position:   number;
  city:       string | null;
  state:      string | null;  // parser state
  country:    string | null;
  ai_city:    string | null;
  ai_state:   string | null;
  ai_country: string | null;
}

async function main() {
  // Hent alle ai-processed rows hvor ai_state mangler
  const { data, error } = await db
    .from("geo_addresses_lab")
    .select("pubmed_id, position, city, state, country, ai_city, ai_state, ai_country")
    .not("ai_processed_at", "is", null)
    .is("ai_state", null)
    .not("ai_action", "eq", "too_long");

  if (error || !data) throw new Error(error?.message ?? "no data");
  const rows = data as Row[];

  // Opdel i recovery (parser havde state) og discovery (begge null)
  const recovery  = rows.filter((r) => r.state !== null);
  const discovery = rows.filter((r) => r.state === null);

  console.log(`Rows med ai_state IS NULL: ${rows.length}`);
  console.log(`  Recovery (parser_state IS NOT NULL): ${recovery.length}`);
  console.log(`  Discovery (begge null):              ${discovery.length}\n`);

  let recoveryHit   = 0;
  let recoveryMiss  = 0;
  let discoveryHit  = 0;
  let discoveryMiss = 0;

  const process = async (row: Row, mode: "recovery" | "discovery") => {
    const city    = row.ai_city    ?? row.city;
    const country = row.ai_country ?? row.country;
    if (!city) return;

    const found = await lookupStateByCity(city, country ?? undefined);
    if (found) {
      await db
        .from("geo_addresses_lab")
        .update({ ai_state: found })
        .eq("pubmed_id", row.pubmed_id)
        .eq("position", row.position);

      if (mode === "recovery") {
        recoveryHit++;
        console.log(
          `  RECOVERY  ${row.pubmed_id}[${row.position}]` +
          `  parser="${row.state}" → ai="${found}"` +
          `  (city=${city}, country=${country})`
        );
      } else {
        discoveryHit++;
        console.log(
          `  DISCOVERY ${row.pubmed_id}[${row.position}]` +
          `  ny state="${found}"` +
          `  (city=${city}, country=${country})`
        );
      }
    } else {
      if (mode === "recovery") recoveryMiss++;
      else discoveryMiss++;
    }
  };

  // ── Recovery ─────────────────────────────────────────────────────────────────
  console.log("── Recovery (parser_state IS NOT NULL, ai_state IS NULL) ──");
  for (const row of recovery) await process(row, "recovery");

  // ── Discovery ─────────────────────────────────────────────────────────────────
  console.log("\n── Discovery (begge null) ──");
  for (const row of discovery) await process(row, "discovery");

  // ── Rapport ───────────────────────────────────────────────────────────────────
  console.log("\n── Rapport ──");
  console.log(`Recovery  hit=${recoveryHit}  miss=${recoveryMiss}  (af ${recovery.length})`);
  console.log(`Discovery hit=${discoveryHit}  miss=${discoveryMiss}  (af ${discovery.length})`);

  // Verificer lost_state i alt
  const { data: check } = await db
    .from("geo_addresses_lab")
    .select("pubmed_id")
    .not("ai_processed_at", "is", null)
    .not("ai_action", "eq", "too_long")
    .not("state", "is", null)
    .is("ai_state", null);

  console.log(`\nTilbageværende lost_state efter berigelse: ${(check ?? []).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
