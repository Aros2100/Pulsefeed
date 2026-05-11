import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, MIN_PAIRS_FOR_PROMPT } from "@/lib/lab/value-scoring/craft-config";
import {
  getDecidedPairCount,
  getPromptVersions,
  type PromptStatus,
} from "@/lib/lab/value-scoring/prompt-versions";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusLabel(status: PromptStatus, scored: number, total: number): string {
  switch (status) {
    case "draft":        return "Draft";
    case "quick_tested": return `Quick tested (${scored}/${scored})`;
    case "scoring":      return `Scoring in progress (${scored}/${total})`;
    case "scored":       return `Scored ${scored}/${total}`;
  }
}

function statusColor(status: PromptStatus): { bg: string; fg: string } {
  switch (status) {
    case "draft":        return { bg: "#fef3c7", fg: "#92400e" };
    case "quick_tested": return { bg: "#dbeafe", fg: "#1e40af" };
    case "scoring":      return { bg: "#dbeafe", fg: "#1e40af" };
    case "scored":       return { bg: "#f0fdf4", fg: "#059669" };
  }
}

export default async function PromptListPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: mod } = await admin
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (!mod) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#5a6a85" }}>Module not found.</div>
            <Link href="/admin/lab" style={{ display: "inline-block", marginTop: "14px", fontSize: "13px", color: "#E83B2A" }}>
              ← Back to Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const moduleId = mod.id as string;
  const decidedPairs = await getDecidedPairCount(admin, moduleId);
  const versions = await getPromptVersions(admin, moduleId);
  const canCreate = decidedPairs >= MIN_PAIRS_FOR_PROMPT;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
              The Lab · Value Scoring · Craft
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Prompt</h1>
            <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
              Develop and test a scoring prompt based on the pairwise data.
            </p>
          </div>
          {canCreate && (
            <Link
              href="/admin/lab/value-scoring/craft/prompt/new"
              style={{
                background: "#E83B2A", color: "#fff",
                border: "none", borderRadius: "6px",
                padding: "8px 14px", fontSize: "13px", fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Create new version
            </Link>
          )}
        </div>

        {!canCreate && (
          <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#92400e" }}>
            Finish more pairwise comparisons before working on the prompt — {decidedPairs} / {MIN_PAIRS_FOR_PROMPT} decided.
          </div>
        )}

        {/* Versions card */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Versions
            </span>
          </div>
          {versions.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
              No prompt versions yet.
              {canCreate && <> Click <strong>Create new version</strong> to start.</>}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafbfc" }}>
                  <th style={{ ...thStyle, width: "80px" }}>Version</th>
                  <th style={{ ...thStyle, width: "180px" }}>Created</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, width: "80px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {versions.map(v => {
                  const color = statusColor(v.status);
                  return (
                    <tr key={v.id} style={{ borderTop: "1px solid #f5f5f5" }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>v{v.version}</td>
                      <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px" }}>{fmtDate(v.created_at)}</td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: "11px", fontWeight: 600,
                          background: color.bg, color: color.fg,
                          borderRadius: "4px", padding: "2px 8px",
                        }}>
                          {statusLabel(v.status, v.scoredCount, v.articleCount)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Link
                          href={`/admin/lab/value-scoring/craft/prompt/${v.id}`}
                          style={{ fontSize: "13px", color: "#E83B2A", textDecoration: "none" }}
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between" }}>
          <Link href="/admin/lab/value-scoring/craft" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to module
          </Link>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#5a6a85",
  padding: "10px 16px",
};

const tdStyle: React.CSSProperties = {
  fontSize: "13px",
  padding: "10px 16px",
};
