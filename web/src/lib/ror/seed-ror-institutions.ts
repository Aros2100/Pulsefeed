/**
 * Seed script: downloads the latest ROR data dump from Zenodo and upserts
 * all institutions into the ror_institutions table.
 *
 * Run with:
 *   npx tsx src/lib/ror/seed-ror-institutions.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import https from "https";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Zenodo concept record for the ROR data dump series ──────────────────────
const ZENODO_RECORD_URL = "https://zenodo.org/api/records/6347574";
const BATCH_SIZE = 500;

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveUrl(base: string, location: string): string {
  if (location.startsWith("http://") || location.startsWith("https://")) return location;
  const b = new URL(base);
  return `${b.protocol}//${b.host}${location}`;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https.get(u, { headers: { "User-Agent": "pulsefeed-ror-seed/1.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(resolveUrl(u, res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }).on("error", reject);
    };
    follow(url);
  });
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https.get(u, { headers: { "User-Agent": "pulsefeed-ror-seed/1.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(resolveUrl(u, res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${u}`));
          return;
        }
        const out = fs.createWriteStream(destPath);
        const total = parseInt(res.headers["content-length"] ?? "0", 10);
        let received = 0;
        let lastPct = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct >= lastPct + 10) {
              process.stdout.write(`  download ${pct}%\r`);
              lastPct = pct;
            }
          }
        });
        res.pipe(out);
        out.on("finish", () => { process.stdout.write("\n"); resolve(); });
        out.on("error", reject);
        res.on("error", reject);
      }).on("error", reject);
    };
    follow(url);
  });
}

// ── ROR schema v2 types ──────────────────────────────────────────────────────

interface RorName {
  value: string;
  types: string[];
  lang?: string | null;
}

interface RorGeonamesDetails {
  name?: string;
  country_name?: string;
  country_code?: string;
  country_subdivision_name?: string;
}

interface RorLocation {
  geonames_details?: RorGeonamesDetails;
}

interface RorRecord {
  id: string;
  names: RorName[];
  types: string[];
  status: string;
  locations: RorLocation[];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ror-seed-"));

  try {
    // 1. Fetch Zenodo record metadata
    console.log("Fetching Zenodo record metadata…");
    const meta = JSON.parse(await httpsGet(ZENODO_RECORD_URL)) as {
      files?: Array<{ key: string; links: { self: string } }>;
      links?: { latest: string };
    };

    // Follow latest version if this is a concept record
    let files = meta.files;
    if (!files && meta.links?.latest) {
      console.log("Following latest version link…");
      const latest = JSON.parse(await httpsGet(meta.links.latest)) as {
        files?: Array<{ key: string; links: { self: string } }>;
      };
      files = latest.files;
    }

    if (!files?.length) {
      throw new Error("No files found in Zenodo record");
    }

    // 2. Find schema_v2 file (prefer schema_v2 in name, fall back to any .zip/.json)
    const schemaFile =
      files.find((f) => f.key.includes("schema_v2") && f.key.endsWith(".zip")) ??
      files.find((f) => f.key.includes("schema_v2") && f.key.endsWith(".json")) ??
      files.find((f) => f.key.endsWith(".zip")) ??
      files.find((f) => f.key.endsWith(".json"));

    if (!schemaFile) {
      console.error("Available files:", files.map((f) => f.key));
      throw new Error("Could not find a usable data file in Zenodo record");
    }

    // Extract dump version from filename, e.g. "v1.73-2025-01-16-ror-data_schema_v2.zip" → "v1.73"
    const versionMatch = schemaFile.key.match(/^(v\d+\.\d+)/);
    const dumpVersion = versionMatch?.[1] ?? "unknown";
    console.log(`Found: ${schemaFile.key} (version: ${dumpVersion})`);

    // 3. Download
    let jsonPath: string;

    if (schemaFile.key.endsWith(".zip")) {
      const zipPath = path.join(tmpDir, "ror-dump.zip");
      const extractDir = path.join(tmpDir, "extracted");
      fs.mkdirSync(extractDir);

      console.log(`Downloading ZIP (~100 MB) to ${zipPath}…`);
      await downloadFile(schemaFile.links.self, zipPath);

      console.log("Extracting ZIP…");
      execSync(`unzip -q "${zipPath}" -d "${extractDir}"`);

      // Find the JSON file in the extract
      const jsonFiles = fs.readdirSync(extractDir).filter((f) => f.endsWith(".json"));
      if (!jsonFiles.length) {
        throw new Error("No .json file found after extracting ZIP");
      }
      jsonPath = path.join(extractDir, jsonFiles[0]);
      console.log(`Extracted: ${jsonFiles[0]}`);
    } else {
      jsonPath = path.join(tmpDir, "ror-data.json");
      console.log("Downloading JSON…");
      await downloadFile(schemaFile.links.self, jsonPath);
    }

    // 4. Parse JSON
    console.log("Parsing JSON (this may take a moment)…");
    const raw = fs.readFileSync(jsonPath, "utf8");
    const records = JSON.parse(raw) as RorRecord[];
    console.log(`Total records: ${records.length.toLocaleString()}`);

    // 5. Map + upsert in batches
    let inserted = 0;
    let skipped = 0;

    const rows = records.map((r) => {
      const displayName = r.names.find((n) => n.types.includes("ror_display"))?.value ?? r.names[0]?.value ?? "";
      const loc = r.locations?.[0]?.geonames_details;

      return {
        ror_id: r.id.replace("https://ror.org/", ""),
        name: displayName,
        city: loc?.name ?? null,
        state: loc?.country_subdivision_name ?? null,
        country: loc?.country_name ?? null,
        country_code: loc?.country_code ?? null,
        institution_type: r.types?.[0] ?? null,
        status: r.status,
        dump_version: dumpVersion,
        updated_at: new Date().toISOString(),
      };
    });

    const batches = Math.ceil(rows.length / BATCH_SIZE);
    console.log(`Upserting ${rows.length.toLocaleString()} records in ${batches} batches of ${BATCH_SIZE}…`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      const { error } = await db
        .from("ror_institutions")
        .upsert(batch, { onConflict: "ror_id" });

      if (error) {
        console.error(`Batch ${batchNum} error:`, error.message);
      } else {
        inserted += batch.length;
        process.stdout.write(`  batch ${batchNum}/${batches} (${inserted.toLocaleString()} upserted)\r`);
      }
    }

    process.stdout.write("\n");

    // Count inactive/withdrawn
    skipped = rows.filter((r) => r.status !== "active").length;

    console.log("\n── Summary ──────────────────────────────");
    console.log(`Dump version : ${dumpVersion}`);
    console.log(`Total rows   : ${rows.length.toLocaleString()}`);
    console.log(`Upserted     : ${inserted.toLocaleString()}`);
    console.log(`Inactive     : ${skipped.toLocaleString()} (included, not skipped)`);
    console.log("─────────────────────────────────────────\n");
  } finally {
    // Clean up tmp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
