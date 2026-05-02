"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type BatchRow = {
  id: string;
  module: string;
  specialty: string;
  prompt_version: string;
  status: string;
  article_count: number;
  submitted_at: string;
  ingested_at: string | null;
  stats: { scored?: number; approved?: number; rejected?: number; failed?: number } | null;
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  submitted:   { color: "#6b7280", bg: "#f3f4f6" },
  in_progress: { color: "#d97706", bg: "#fef9c3" },
  ended:       { color: "#1d4ed8", bg: "#dbeafe" },
  ingesting:   { color: "#7c3aed", bg: "#ede9fe" },
  ingested:    { color: "#15803d", bg: "#dcfce7" },
  failed:      { color: "#b91c1c", bg: "#fee2e2" },
  expired:     { color: "#b91c1c", bg: "#fee2e2" },
  cancelled:   { color: "#6b7280", bg: "#f3f4f6" },
};

const ACTIVE_STATUSES = new Set(["submitted", "in_progress", "ended"]);

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { color: "#6b7280", bg: "#f3f4f6" };
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, color: s.color, background: s.bg, borderRadius: "20px", padding: "2px 10px" }}>
      {status}
    </span>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function BatchListClient({ initialBatches }: { initialBatches: BatchRow[] }) {
  const [batches, setBatches] = useState<BatchRow[]>(initialBatches);
  const router = useRouter();

  const hasActive = batches.some((b) => ACTIVE_STATUSES.has(b.status));

  useEffect(() => {
    if (!hasActive) return;

    const interval = setInterval(async () => {
      const active = batches.filter((b) => ACTIVE_STATUSES.has(b.status));
      for (const batch of active) {
        try {
          const res = await fetch(`/api/scoring/batch/${batch.id}/poll`, { method: "POST" });
          const json = await res.json();
          if (json.ok && json.batch) {
            setBatches((prev) => prev.map((b) =>
              b.id === json.batch.id ? { ...b, ...json.batch } : b
            ));
            if (json.batch.status === "ended" && !json.batch.ingested_at) {
              fetch(`/api/scoring/batch/${json.batch.id}/ingest`, { method: "POST" })
                .catch(() => {/* cron tager over hvis browser fejler */});
            }
          }
        } catch { /* ignore */ }
      }
      router.refresh();
    }, 30_000);

    return () => clearInterval(interval);
  }, [hasActive, batches, router]);

  if (batches.length === 0) {
    return (
      <div style={{ padding: "24px 20px", fontSize: "13px", color: "#888" }}>No batches yet.</div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #dde3ed" }}>
            {["Module", "Status", "Articles", "Submitted", "Stats"].map((h) => (
              <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontWeight: 700, fontSize: "11px", letterSpacing: "0.05em", textTransform: "uppercase", color: "#5a6a85", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batches.map((b, i) => (
            <tr key={b.id} style={{ borderBottom: "1px solid #f1f3f7", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
              <td style={{ padding: "9px 14px", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                <Link href={`/admin/system/scoring/batches/${b.id}`} style={{ color: "#1a1a1a", textDecoration: "none" }}>
                  {b.module}
                </Link>
              </td>
              <td style={{ padding: "9px 14px" }}><StatusBadge status={b.status} /></td>
              <td style={{ padding: "9px 14px", color: "#444" }}>{b.article_count.toLocaleString("en-US")}</td>
              <td style={{ padding: "9px 14px", color: "#5a6a85", whiteSpace: "nowrap" }}>{fmtDate(b.submitted_at)}</td>
              <td style={{ padding: "9px 14px", color: "#444" }}>
                {b.stats ? (
                  <span>
                    {b.module === "specialty" ? (
                      <>
                        <span style={{ color: "#15803d" }}>{b.stats.approved ?? 0} ✓</span>
                        {" · "}
                        <span style={{ color: "#d97706" }}>{b.stats.rejected ?? 0} ✗</span>
                      </>
                    ) : (
                      <span style={{ color: "#15803d" }}>{b.stats.scored ?? 0} ✓</span>
                    )}
                    {(b.stats.failed ?? 0) > 0 && <span style={{ color: "#b91c1c" }}>{" · "}{b.stats.failed} failed</span>}
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
