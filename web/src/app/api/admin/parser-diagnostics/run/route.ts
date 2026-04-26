import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { stripEmailFromAffiliation } from "@/lib/geo/affiliation-utils";
import { lookupState } from "@/lib/geo/state-map";
import { getCityCache } from "@/lib/geo/city-cache";

const TIMEOUT_MS = 10_000;
const CHUNK_SIZE = 200;
const WARN_TOTAL_MS = 50_000;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const run_name = (body.run_name as string | undefined)?.trim();
  const run_notes = (body.run_notes as string | undefined)?.trim() || null;

  if (!run_name) {
    return NextResponse.json({ error: "run_name is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: samples, error: sampleError } = await admin
    .from("geo_fase0_sample")
    .select("article_id, pubmed_id, affiliations")
    .order("id");

  if (sampleError) {
    return NextResponse.json({ error: sampleError.message }, { status: 500 });
  }

  const rows = (samples ?? []) as {
    article_id: string;
    pubmed_id: string;
    affiliations: string[] | null;
  }[];

  // Pre-warm city cache once before the loop
  await getCityCache();

  const run_id = crypto.randomUUID();
  const run_started_at = new Date().toISOString();
  const globalStart = Date.now();

  const insertRows: object[] = [];
  let successful_parses = 0;
  let null_returns = 0;
  let errors = 0;
  let with_country = 0;
  let with_city = 0;
  let high_confidence = 0;
  let total_duration = 0;

  for (const row of rows) {
    const rawAffiliation =
      Array.isArray(row.affiliations) && row.affiliations.length > 0
        ? row.affiliations[0]
        : "";

    const input_string = stripEmailFromAffiliation(rawAffiliation);

    let parsed_country: string | null = null;
    let parsed_city: string | null = null;
    let parsed_state: string | null = null;
    let parsed_institution: string | null = null;
    let parsed_department: string | null = null;
    let parsed_confidence: string | null = null;
    let parse_duration_ms = 0;
    let parse_error: string | null = null;

    const start = Date.now();

    try {
      const parsePromise = parseAffiliation(input_string);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
      );

      const result = await Promise.race([parsePromise, timeoutPromise]);
      parse_duration_ms = Date.now() - start;

      if (result === null) {
        null_returns++;
      } else {
        successful_parses++;
        parsed_country = result.country;
        parsed_city = result.city;
        parsed_institution = result.institution;
        parsed_department = result.department;
        parsed_confidence = result.confidence;
        parsed_state =
          result.city && result.country
            ? lookupState(result.city, result.country)
            : null;

        if (result.country) with_country++;
        if (result.city) with_city++;
        if (result.confidence === "high") high_confidence++;
      }
    } catch (err) {
      parse_duration_ms = Date.now() - start;
      parse_error = err instanceof Error ? err.message : String(err);
      if (parse_error === "timeout") parse_duration_ms = TIMEOUT_MS;
      errors++;
      console.error(
        `[parser-diagnostics] Error parsing pubmed_id=${row.pubmed_id}:`,
        err
      );
    }

    total_duration += parse_duration_ms;

    insertRows.push({
      run_id,
      run_name,
      run_notes,
      run_started_at,
      article_id: row.article_id,
      pubmed_id: row.pubmed_id,
      input_string,
      parsed_country,
      parsed_city,
      parsed_state,
      parsed_institution,
      parsed_department,
      parsed_confidence,
      parse_duration_ms,
      parse_error,
    });
  }

  const total_wall_ms = Date.now() - globalStart;
  if (total_wall_ms > WARN_TOTAL_MS) {
    console.warn(
      `[parser-diagnostics] Run took ${total_wall_ms}ms — exceeded ${WARN_TOTAL_MS}ms warning threshold`
    );
  }

  // Batch insert in chunks
  for (let i = 0; i < insertRows.length; i += CHUNK_SIZE) {
    const chunk = insertRows.slice(i, i + CHUNK_SIZE);
    const { error: insertError } = await admin
      .from("geo_fase0_parser_runs")
      .insert(chunk);
    if (insertError) {
      return NextResponse.json(
        { error: `Insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }
  }

  const total = insertRows.length;
  const mean_duration_ms =
    total > 0 ? Math.round((total_duration / total) * 10) / 10 : 0;

  return NextResponse.json({
    run_id,
    run_name,
    total,
    successful_parses,
    null_returns,
    errors,
    with_country,
    with_city,
    high_confidence,
    mean_duration_ms,
    total_duration_ms: total_duration,
  });
}
