/**
 * Smoke-test: production Klasse A-parser fixes
 * Tests: Cedex+street-prefix, whitespace normalization, negative cases.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-prod-class-a-fixes.ts
 */

import { parseAffiliation } from "../src/lib/geo/v2/affiliation-parser";

interface Case {
  label:       string;
  input:       string;
  expectCity?: string;
  expectState?: string;
  expectCountry?: string;
  expectNotNull: boolean;
}

const CASES: Case[] = [
  {
    label: "Cedex med gade-prefix",
    input: "Sainte-Anne Military Hospital, 2, boulevard Sainte-Anne, 83800 Toulon cedex 9, France",
    expectCity:    "Toulon",
    expectCountry: "France",
    expectNotNull: true,
  },
  {
    label: "Cedex uden gade",
    input: "Service de Neurochirurgie, CHU de Bordeaux, 33000 Bordeaux Cedex, France",
    expectCity:    "Bordeaux",
    expectCountry: "France",
    expectNotNull: true,
  },
  {
    label: "Cedex med accent (Cédex)",
    input: "Hôpital Sainte-Musse, 54 rue Henri Sainte-Claire Deville, 83100 Toulon Cédex, France",
    expectCity:    "Toulon",
    expectCountry: "France",
    expectNotNull: true,
  },
  {
    label: "Sammenflydende tokens (BrisbaneQLD)",
    input: "Centre for Clinical Research, University of Queensland, BrisbaneQLD, Australia",
    expectCity:    "Brisbane",
    expectCountry: "Australia",
    expectNotNull: true,
  },
  {
    label: "Manglende space efter semikolon (Klasse A afviser stadig semicolon)",
    input: "Aarhus University Hospital;Department of Clinical Medicine, Aarhus, Denmark",
    expectNotNull: false,  // semicolon → null (Klasse C/B, ikke A)
  },
  {
    label: "Negativ: Stanford (ingen regression)",
    input: "Stanford School of Medicine, Palo Alto, CA, USA",
    expectCity:    "Palo Alto",
    expectState:   "California",
    expectCountry: "United States",
    expectNotNull: true,
  },
  {
    label: "Negativ: Mayo Clinic (ingen regression)",
    input: "Department of Neurosurgery, Mayo Clinic, Rochester, Minnesota, United States",
    expectCity:    "Rochester",
    expectState:   "Minnesota",
    expectCountry: "United States",
    expectNotNull: true,
  },
];

async function main() {
  let passed = 0;
  let failed = 0;

  for (const tc of CASES) {
    const result = await parseAffiliation(tc.input);

    const isNull  = result === null;
    const nullOk  = tc.expectNotNull ? !isNull : isNull;
    const cityOk  = !tc.expectCity    || result?.city    === tc.expectCity;
    const stateOk = !tc.expectState   || result?.state   === tc.expectState;
    const cntryOk = !tc.expectCountry || result?.country === tc.expectCountry;

    const ok = nullOk && cityOk && stateOk && cntryOk;

    if (ok) {
      passed++;
      console.log(`PASS  ${tc.label}`);
    } else {
      failed++;
      console.log(`FAIL  ${tc.label}`);
      if (!nullOk)  console.log(`      expected ${tc.expectNotNull ? "non-null" : "null"}, got ${isNull ? "null" : "non-null"}`);
      if (!cityOk)  console.log(`      city:    expected="${tc.expectCity}"  got="${result?.city}"`);
      if (!stateOk) console.log(`      state:   expected="${tc.expectState}"  got="${result?.state}"`);
      if (!cntryOk) console.log(`      country: expected="${tc.expectCountry}"  got="${result?.country}"`);
    }
  }

  console.log(`\n${passed}/${CASES.length} passed${failed > 0 ? `  (${failed} FAILED)` : ""}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
