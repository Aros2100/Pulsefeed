"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface VersionOption {
  id:      string;
  version: number;
  scoredCount: number;
  articleCount: number;
}

interface Props {
  versions:     VersionOption[];
  promptId:     string;
  minScoreDiff: number;
}

export default function EvaluationFilters({ versions, promptId, minScoreDiff }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) sp.set(k, v);
    startTransition(() => router.push(`?${sp.toString()}`));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", marginBottom: "24px", opacity: pending ? 0.6 : 1 }}>
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85" }}>
          Version
        </span>
        <select
          value={promptId}
          onChange={e => update({ promptId: e.target.value })}
          style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px",
            padding: "6px 10px", fontSize: "13px", color: "#1a1a1a",
          }}
        >
          {versions.map(v => (
            <option key={v.id} value={v.id}>
              v{v.version} ({v.scoredCount}/{v.articleCount})
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85" }}>
          Min score diff
        </span>
        <input
          type="number"
          step="0.1"
          min="0"
          value={minScoreDiff}
          onChange={e => update({ minScoreDiff: e.target.value })}
          style={{
            width: "70px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px",
            padding: "6px 8px", fontSize: "13px", color: "#1a1a1a",
          }}
        />
        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
          (hide close calls)
        </span>
      </label>
    </div>
  );
}
