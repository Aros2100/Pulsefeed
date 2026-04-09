/**
 * Fix authors where the hospital field contains a department name.
 * Fetches the correct institution name from ROR and moves the old
 * hospital value to department (if not already set).
 *
 * Run with:
 *   cd web && npx tsx src/scripts/backfill-fix-department-in-hospital.ts           # live
 *   cd web && npx tsx src/scripts/backfill-fix-department-in-hospital.ts --dry-run # preview
 */

import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  const val = trimmed.slice(eq + 1);
  if (!process.env[key]) process.env[key] = val;
}

import { createAdminClient } from "@/lib/supabase/admin";

const BATCH_SIZE     = 50;
const BATCH_DELAY_MS = 300;
const DRY_RUN        = process.argv.includes("--dry-run");
const ROR_BASE       = "https://api.ror.org/organizations";

const DEPT_KEYWORDS = ["department", "division", "section", "unit", "laboratory", "lab "];

interface AuthorRow {
  id: string;
  display_name: string;
  ror_id: string;
  hospital: string;
  department: string | null;
}

interface RorName {
  value: string;
  types: string[];
  lang: string | null;
}

interface RorOrg {
  names?: RorName[];
}

function isDepartment(name: string): boolean {
  const lower = name.toLowerCase();
  return DEPT_KEYWORDS.some(kw => lower.startsWith(kw));
}

async function fetchRorDisplayName(rorId: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${ROR_BASE}/${rorId}`, {
      headers: { "User-Agent": "pulsefeed/1.0 (mailto:digest@pulsefeed.dk)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`  [ror] ${rorId}: HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as RorOrg;
    if (!data.names || data.names.length === 0) return null;

    const rorDisplay = data.names.find(n => n.types.includes("ror_display"));
    return rorDisplay?.value ?? null;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(
      `  [ror] ${rorId}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function main() {
  const admin = createAdminClient();

  if (DRY_RUN) console.log("\n*** DRY RUN — no writes ***\n");

  let totalProcessed  = 0;
  let totalHospital   = 0;
  let totalDepartment = 0;
  let batchNum        = 0;
  let offset          = 0;

  const filter = DEPT_KEYWORDS.map(kw => `hospital.ilike.%${kw.trim()}%`).join(",");

  while (true) {
    batchNum++;

    const { data: authors, error } = await admin
      .from("authors")
      .select("id, display_name, ror_id, hospital, department")
      .not("ror_id", "is", null)
      .or(filter)
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1) as unknown as {
        data: AuthorRow[] | null;
        error: { message: string } | null;
      };

    if (error) {
      console.error("Query error:", error.message);
      break;
    }

    if (!authors || authors.length === 0) break;

    let batchHospital   = 0;
    let batchDepartment = 0;

    for (const author of authors) {
      totalProcessed++;

      // Double-check that the current hospital value actually looks like a department
      if (!isDepartment(author.hospital)) {
        console.log(`  ${author.display_name}: hospital "${author.hospital}" — skipping (no dept keyword at start)`);
        continue;
      }

      const displayName = await fetchRorDisplayName(author.ror_id);

      if (!displayName) {
        console.warn(`  ${author.display_name} (${author.ror_id}): no ROR display name`);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {
        hospital: displayName,
      };
      batchHospital++;

      if (!author.department) {
        updates.department = author.hospital;
        batchDepartment++;
      }

      console.log(
        `  ${author.display_name}:` +
        ` hospital: "${author.hospital}" → "${displayName}"` +
        (updates.department ? ` | department: "${updates.department}"` : "") +
        (DRY_RUN ? " [dry]" : "")
      );

      if (!DRY_RUN) {
        const { error: updateError } = await admin
          .from("authors")
          .update(updates)
          .eq("id", author.id);

        if (updateError) {
          console.warn(`  Supabase error for ${author.id}: ${updateError.message}`);
          continue;
        }
      }
    }

    totalHospital   += batchHospital;
    totalDepartment += batchDepartment;

    console.log(
      `Batch ${batchNum}: ${authors.length} authors, ` +
      `+hospital_fixed=${batchHospital}, +department_moved=${batchDepartment}`
    );

    if (authors.length < BATCH_SIZE) break;

    offset += BATCH_SIZE;
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN " : ""}Summary ===`);
  console.log(`  Authors processed:     ${totalProcessed}`);
  console.log(`  Hospital fixed:        ${totalHospital}`);
  console.log(`  Department moved:      ${totalDepartment}`);
  console.log(`  Batches processed:     ${batchNum}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
