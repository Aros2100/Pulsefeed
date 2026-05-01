/**
 * Smoke-test for the Cedex gade-prefix fix.
 * Tests both the existing cases (must still pass) and the new ones.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-cedex-fix.ts
 */

import { parseAffiliation } from "../src/admin/lab/geo-validation/parser/affiliation-parser";

interface Case {
  label: string;
  input: string;
  expect: { city?: string | null; institution?: string; institution2?: string | null; country?: string };
}

const CASES: Case[] = [
  // ── Eksisterende (skal fortsat virke) ──────────────────────────────────────
  {
    label: "Bare postal+city Cedex",
    input: "83800 Toulon Cedex 9",
    expect: { city: "Toulon" },
  },
  {
    label: "City Cedex number",
    input: "Toulon Cedex 9",
    expect: { city: "Toulon" },
  },
  {
    label: "Marseille Cedex",
    input: "13385 Marseille Cedex 5",
    expect: { city: "Marseille" },
  },
  {
    label: "Aix accent Cédex",
    input: "Aix-en-Provence Cédex 1",
    expect: { city: "Aix-en-Provence" },
  },

  // ── Nye (street-prefix stripped) ───────────────────────────────────────────
  {
    label: "PMID 33989644 — boulevard Sainte-Anne + Toulon cedex",
    input: "Sainte-Anne Military teaching Hospital, 2, boulevard Sainte-Anne, 83800 Toulon cedex 9, France",
    expect: { institution: "Sainte-Anne Military teaching Hospital", institution2: null, city: "Toulon", country: "France" },
  },
  {
    label: "Place Laveran + Paris cedex",
    input: "Val-de-Grâce Military Teaching Hospital, 1, place Alphonse-Laveran, 75230 Paris cedex 5, France",
    expect: { city: "Paris", country: "France" },
  },

  // ── Negatitve — skal IKKE påvirke ──────────────────────────────────────────
  {
    label: "Stanford (ingen Cedex)",
    input: "Stanford School of Medicine, Palo Alto, CA, USA",
    expect: { city: "Palo Alto", country: "United States" },
  },
  {
    label: "Boston (ingen Cedex)",
    input: "Department of Neurosurgery, Massachusetts General Hospital, Boston, MA, USA",
    expect: { city: "Boston", country: "United States" },
  },
];

async function main() {
  let passed = 0;
  let failed = 0;

  for (const c of CASES) {
    const result = await parseAffiliation(c.input);
    const failures: string[] = [];

    for (const [key, expected] of Object.entries(c.expect)) {
      const actual = result ? (result as Record<string, unknown>)[key] : null;
      if (expected === null) {
        if (actual !== null && actual !== undefined) {
          failures.push(`  ${key}: expected null, got ${JSON.stringify(actual)}`);
        }
      } else if (expected !== undefined && actual !== expected) {
        failures.push(`  ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    }

    if (failures.length === 0) {
      console.log(`✓  ${c.label}`);
      passed++;
    } else {
      console.log(`✗  ${c.label}`);
      for (const f of failures) console.log(f);
      if (result) {
        console.log(`   full result: city=${result.city}, country=${result.country}, inst=${result.institution}, inst2=${result.institution2}`);
      } else {
        console.log(`   full result: null`);
      }
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
