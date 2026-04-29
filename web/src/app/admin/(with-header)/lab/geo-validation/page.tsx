import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

type ProgressRow = {
  bucket: string;
  total: number;
  validated: number;
};

const BUCKET_LABELS: Record<string, string> = {
  none:                  "None (parser only)",
  institution_only:      "Institution only",
  state_only:            "State only",
  state_and_institution: "State + Institution",
  full:                  "Full AI",
};

const BUCKET_COLOR: Record<string, string> = {
  none:                  "#15803d",
  institution_only:      "#0284c7",
  state_only:            "#7c3aed",
  state_and_institution: "#d97706",
  full:                  "#dc2626",
};

export default async function GeoValidationPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_geo_validation_progress");

  const rows = (error ? [] : data ?? []) as ProgressRow[];
  const total     = rows.reduce((s: number, r: ProgressRow) => s + Number(r.total), 0);
  const validated = rows.reduce((s: number, r: ProgressRow) => s + Number(r.validated), 0);
  const pct = total > 0 ? Math.round((validated / total) * 100) : 0;

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/lab" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← The Lab
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            The Lab
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Geo Validation
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Validate geo pipeline output on 1.000 test articles
          </p>
        </div>

        {/* Overall progress */}
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          padding: "24px 28px",
          marginBottom: "20px",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>Samlet fremdrift</span>
            <span style={{ fontSize: "13px", color: "#5a6a85" }}>
              {validated} / {total} · {pct}%
            </span>
          </div>
          <div style={{ background: "#f3f4f6", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
            <div style={{
              background: "#15803d",
              width: `${pct}%`,
              height: "100%",
              borderRadius: "4px",
              transition: "width 0.3s",
            }} />
          </div>
        </div>

        {/* Bucket cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {rows.map((row: ProgressRow) => {
            const color   = BUCKET_COLOR[row.bucket] ?? "#5a6a85";
            const label   = BUCKET_LABELS[row.bucket] ?? row.bucket;
            const bTotal  = Number(row.total);
            const bDone   = Number(row.validated);
            const bPct    = bTotal > 0 ? Math.round((bDone / bTotal) * 100) : 0;
            const isDone  = bDone >= bTotal;

            return (
              <Link
                key={row.bucket}
                href={`/admin/lab/geo-validation/validate?bucket=${row.bucket}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  padding: "20px 24px",
                  cursor: "pointer",
                }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 600 }}>{label}</span>
                      {isDone && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "#fff",
                          background: "#15803d",
                          borderRadius: "4px",
                          padding: "2px 6px",
                        }}>
                          DONE
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <span style={{ fontSize: "13px", color: "#5a6a85" }}>
                        {bDone} / {bTotal}
                      </span>
                      <span style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: isDone ? "#15803d" : color,
                        minWidth: "36px",
                        textAlign: "right" as const,
                      }}>
                        {bPct}%
                      </span>
                      <span style={{ fontSize: "16px", color: "#bbb" }}>→</span>
                    </div>
                  </div>
                  <div style={{ background: "#f3f4f6", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                    <div style={{
                      background: isDone ? "#15803d" : color,
                      width: `${bPct}%`,
                      height: "100%",
                      borderRadius: "4px",
                      transition: "width 0.3s",
                    }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Report link */}
        <div style={{ marginTop: "32px", textAlign: "center" as const }}>
          <Link href="/admin/lab/geo-validation/report" style={{
            fontSize: "13px",
            color: "#5a6a85",
            textDecoration: "none",
            borderBottom: "1px solid #e5e7eb",
            paddingBottom: "2px",
          }}>
            Se rapport →
          </Link>
        </div>

      </div>
    </div>
  );
}
