import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "../src/lib/supabase/admin";
import { parseAffiliation } from "../src/lib/geo/v2/affiliation-parser";
import { getCityCache } from "../src/lib/geo/v2/city-cache";

const CASES = [
  { pmid: "42060939", expected: "China Three Gorges University" },
  { pmid: "42051409", expected: "Jordan University of Science and Technology" },
  { pmid: "42038910", expected: "Iran University of Medical Sciences" },
  { pmid: "42021831", expected: "Iran University of Medical Sciences" },
  { pmid: "42015771", expected: "China Academy of Chinese Medical Sciences" },
];

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const cache = await getCityCache();

  let passed = 0;
  for (const { pmid, expected } of CASES) {
    const { data: art } = await admin
      .from("articles").select("authors").eq("pubmed_id", pmid).single();

    const rawAuthor = (art?.authors ?? [])[0] ?? {};
    const firstAffil: string =
      (Array.isArray(rawAuthor.affiliations) && rawAuthor.affiliations[0]) ||
      rawAuthor.affiliation || "";

    const result = await parseAffiliation(firstAffil, cache);
    const institutions = [result?.institution, result?.institution2, result?.institution3]
      .filter(Boolean).join(" | ");

    const hasPhantom = institutions.includes(";");
    const status = hasPhantom ? "❌" : "✓";
    if (!hasPhantom) passed++;

    console.log(`${status} PMID ${pmid}`);
    console.log(`   affil:    ${firstAffil.slice(0, 90)}`);
    console.log(`   inst:     ${institutions}`);
    console.log(`   expected: ${expected}`);
  }

  console.log(`\n${passed}/${CASES.length} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
