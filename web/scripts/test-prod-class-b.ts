/**
 * Smoke-test: production Klasse B-parser
 * Kører på kendte Klasse B-strenge og verificerer:
 * - Returnerer ikke null
 * - Korrekt antal adresse-rows
 * - Forventede geo-felter per row
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-prod-class-b.ts
 */

import { parseClassB } from "../src/lib/geo/v2/affiliation-parser-b";

interface RowExpect {
  city?:    string;
  country?: string;
  state?:   string;
}

interface Case {
  label:       string;
  input:       string;
  expectRows:  number;               // 0 = expect null
  rows?:       RowExpect[];
}

const CASES: Case[] = [
  {
    label: "Mayo Clinic + Northwestern (2 adresser, USA)",
    input: "Department of Neurologic Surgery and Radiology, Mayo Clinic, Rochester, Minnesota, USA; Department of Neurologic Surgery, Northwestern Memorial Hospital, Chicago, Illinois, USA.",
    expectRows: 2,
    rows: [
      { city: "Rochester", state: "Minnesota", country: "United States" },
      { city: "Chicago",   state: "Illinois",  country: "United States" },
    ],
  },
  {
    label: "Brisbane + Aarhus (sammenflydende tokens)",
    input: "Centre for Clinical Research, University of Queensland, BrisbaneQLD, Australia; Department of Nuclear Medicine & PET-Centre, Aarhus University HospitalAarhus, Denmark.",
    expectRows: 2,
    rows: [
      { country: "Australia" },
      { city: "Aarhus", country: "Denmark" },
    ],
  },
  {
    label: "Odense 2 adresser (Denmark)",
    input: "Department of Neurosurgery, Odense University Hospital, Odense 5000, Denmark; Department of Clinical Research and BRIDGE-Brain Research Inter-Disciplinary Guided Excellence, University of Southern Denmark, Odense, Denmark.",
    expectRows: 2,
    rows: [
      { city: "Odense", country: "Denmark" },
      { city: "Odense", country: "Denmark" },
    ],
  },
  {
    label: "Brazil 2 adresser",
    input: "Laboratório de Neurociências Translacional, Programa de Pós-Graduação em Neurologia, Universidade Federal do Estado do Rio de Janeiro, Rio de Janeiro, 20211-030, Brazil; Departamento de Neurocirurgia, Hospital Universitário Clementino Fraga Filho, Universidade Federal do Rio de Janeiro, Rio de Janeiro, RJ 3938-2480, Brazil.",
    expectRows: 2,
    rows: [
      { country: "Brazil" },
      { country: "Brazil" },
    ],
  },
  {
    label: "; and. trailing (skal returnere null — er Klasse A)",
    input: "Division of Functional and Stereotactic Neurosurgery, University Hospitals Cleveland Medical Center, Cleveland, Ohio; and.",
    expectRows: 0,
  },
  {
    label: "Lyon France + Bron France (2 adresser)",
    input: "Lyon Neuroscience Research Centre, CRNL - CH Le Vinatier, 95 Bd Pinel, 69500 Bron, France; Hospices Civils de Lyon, Hôpital Pierre Wertheimer, 59 Bd Pinel, 69500 Bron, France.",
    expectRows: 2,
    rows: [
      { city: "Bron", country: "France" },
      { city: "Bron", country: "France" },
    ],
  },
];

async function main() {
  let passed = 0;
  let failed = 0;

  for (const tc of CASES) {
    const result = await parseClassB(tc.input);

    if (tc.expectRows === 0) {
      if (result === null) {
        passed++;
        console.log(`PASS  ${tc.label}  (null som forventet)`);
      } else {
        failed++;
        console.log(`FAIL  ${tc.label}  (forventet null, fik ${result.length} rows)`);
      }
      continue;
    }

    if (result === null) {
      failed++;
      console.log(`FAIL  ${tc.label}  (fik null, forventet ${tc.expectRows} rows)`);
      continue;
    }

    const countOk = result.length === tc.expectRows;
    let rowsOk = true;
    const rowErrors: string[] = [];

    for (let i = 0; i < (tc.rows ?? []).length; i++) {
      const exp = tc.rows![i];
      const got = result[i];
      if (!got) { rowErrors.push(`  row ${i + 1}: mangler`); rowsOk = false; continue; }
      if (exp.city    && got.city    !== exp.city)    { rowErrors.push(`  row ${i + 1} city:    "${exp.city}" ≠ "${got.city}"`);    rowsOk = false; }
      if (exp.state   && got.state   !== exp.state)   { rowErrors.push(`  row ${i + 1} state:   "${exp.state}" ≠ "${got.state}"`);  rowsOk = false; }
      if (exp.country && got.country !== exp.country) { rowErrors.push(`  row ${i + 1} country: "${exp.country}" ≠ "${got.country}"`); rowsOk = false; }
    }

    if (countOk && rowsOk) {
      passed++;
      console.log(`PASS  ${tc.label}  (${result.length} rows)`);
    } else {
      failed++;
      console.log(`FAIL  ${tc.label}`);
      if (!countOk) console.log(`      rows: forventet=${tc.expectRows}  fik=${result.length}`);
      rowErrors.forEach((e) => console.log(e));
    }
  }

  console.log(`\n${passed}/${CASES.length} passed${failed > 0 ? `  (${failed} FAILED)` : ""}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
