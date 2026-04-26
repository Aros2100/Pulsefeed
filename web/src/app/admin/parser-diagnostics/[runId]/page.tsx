import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { RunDetailClient, type RunRow } from "./_components/RunDetailClient";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: raw, error } = await admin
    .from("geo_fase0_parser_runs")
    .select("id, run_id, run_name, run_notes, run_started_at, pubmed_id, input_string, parsed_country, parsed_city, parsed_state, parsed_institution, parsed_department, parsed_confidence, parse_duration_ms, parse_error")
    .eq("run_id", runId)
    .order("pubmed_id")
    .limit(2000);

  if (error) throw new Error(error.message);

  const rows = (raw ?? []) as RunRow[];

  if (rows.length === 0) notFound();

  const meta = rows[0] as RunRow & { run_name: string; run_notes: string | null; run_started_at: string };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85", display: "flex", gap: "8px" }}>
          <Link href="/admin/system" style={{ color: "#5a6a85", textDecoration: "none" }}>System</Link>
          <span>·</span>
          <Link href="/admin/parser-diagnostics" style={{ color: "#5a6a85", textDecoration: "none" }}>Parser Diagnostics</Link>
          <span>·</span>
          <span style={{ color: "#1a1a1a" }}>{(meta as unknown as { run_name: string }).run_name}</span>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Geo
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 4px" }}>
            {(meta as unknown as { run_name: string }).run_name}
          </h1>
          <div style={{ display: "flex", gap: "20px", fontSize: "13px", color: "#5a6a85" }}>
            <span>Started: {fmt((meta as unknown as { run_started_at: string }).run_started_at)}</span>
            {(meta as unknown as { run_notes: string | null }).run_notes && (
              <span>Notes: {(meta as unknown as { run_notes: string }).run_notes}</span>
            )}
          </div>
        </div>

        <RunDetailClient rows={rows} />

      </div>
    </div>
  );
}
