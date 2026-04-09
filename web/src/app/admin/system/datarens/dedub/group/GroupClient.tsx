"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Author {
  id: string;
  display_name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  hospital: string | null;
  openalex_id: string | null;
  orcid: string | null;
  article_count: number | null;
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | null;
  highlight?: "green" | "muted";
}) {
  const color = highlight === "green" ? "#15803d"
    : highlight === "muted" ? "#9ca3af"
    : value ? "#374151" : "#d1d5db";
  return (
    <div style={{ display: "flex", gap: "8px", fontSize: "12px", alignItems: "baseline" }}>
      <span style={{ color: "#9ca3af", width: "58px", flexShrink: 0, textAlign: "right" as const }}>
        {label}
      </span>
      <span style={{ color, fontWeight: highlight ? 600 : 400 }}>
        {value ?? (highlight ? "mangler" : "—")}
      </span>
    </div>
  );
}

export default function GroupClient({ authors }: { authors: Author[] }) {
  const router = useRouter();

  const [masterId, setMasterId]  = useState<string>(authors[0]?.id ?? "");
  const [slaveSet, setSlaveSet]  = useState<Set<string>>(
    () => new Set(authors.slice(1).map((a) => a.id))
  );
  const [merging, setMerging]    = useState(false);
  const [toast,   setToast]      = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function selectMaster(id: string) {
    setMasterId(id);
    setSlaveSet((prev) => {
      const next = new Set(prev);
      next.delete(id);
      if (masterId && masterId !== id) next.add(masterId);
      return next;
    });
  }

  function toggleSlave(id: string) {
    setSlaveSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleMerge() {
    if (!masterId || slaveSet.size === 0) return;
    setMerging(true);
    try {
      const res = await fetch("/api/admin/dedub/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master_id: masterId, slave_ids: [...slaveSet] }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Ukendt fejl");
      setToast("Merge fuldført");
      setTimeout(() => router.push("/admin/datarens/dedub"), 1500);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Merge fejlede");
      setMerging(false);
    }
  }

  const slaveCount = slaveSet.size;
  const consolidatedArticles = authors
    .filter((a) => a.id !== masterId && slaveSet.has(a.id))
    .reduce((sum, a) => sum + (a.article_count ?? 0), 0);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed" as const, top: "16px", right: "16px", zIndex: 1000,
          background: "#1a1a1a", color: "#fff", padding: "10px 20px",
          borderRadius: "8px", fontSize: "13px", fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <Link href="/admin/datarens/dedub" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>← tilbage</Link>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase" as const, fontWeight: 700, marginTop: "8px", marginBottom: "4px" }}>
            Dedub
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Mulige dubletter</h1>
        </div>

        {/* Author cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}>
          {authors.map((author) => {
            const isMaster = author.id === masterId;
            const isSlave  = slaveSet.has(author.id);
            return (
              <div
                key={author.id}
                style={{
                  background: "#fff", borderRadius: "12px",
                  border: `2px solid ${isMaster ? "#E83B2A" : isSlave ? "#2563eb" : "#e5e7eb"}`,
                  padding: "20px",
                  position: "relative" as const,
                }}
              >
                {/* Master badge */}
                {isMaster && (
                  <div style={{
                    position: "absolute" as const, top: 0, right: "16px",
                    background: "#E83B2A", color: "#fff",
                    fontSize: "10px", fontWeight: 700, padding: "2px 8px",
                    borderRadius: "0 0 6px 6px", letterSpacing: "0.05em",
                  }}>
                    MASTER
                  </div>
                )}

                {/* Name + link */}
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px", paddingRight: isMaster ? "60px" : 0 }}>
                    {author.display_name ?? "—"}
                  </div>
                  <Link
                    href={`/admin/authors/${author.id}`}
                    target="_blank"
                    style={{ fontSize: "11px", color: "#E83B2A", textDecoration: "none", fontWeight: 600 }}
                  >
                    Åbn forfatterkort ↗
                  </Link>
                </div>

                {/* Fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "14px" }}>
                  <Field label="OpenAlex" value={author.openalex_id} highlight={author.openalex_id ? "green" : "muted"} />
                  <Field label="ORCID"    value={author.orcid}       highlight={author.orcid       ? "green" : "muted"} />
                  <Field label="Land"     value={author.country} />
                  <Field label="Stat"     value={author.state} />
                  <Field label="By"       value={author.city} />
                  <Field label="Hospital" value={author.hospital} />
                  <Field label="Artikler" value={String(author.article_count ?? 0)} />
                </div>

                {/* Controls */}
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                    <input
                      type="radio"
                      name="master"
                      checked={isMaster}
                      onChange={() => selectMaster(author.id)}
                      style={{ accentColor: "#E83B2A" }}
                    />
                    Vælg som master
                  </label>
                  {!isMaster && (
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                      <input
                        type="checkbox"
                        checked={isSlave}
                        onChange={() => toggleSlave(author.id)}
                        style={{ accentColor: "#2563eb" }}
                      />
                      Merge ind i master
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Merge bar */}
        <div style={{
          background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb",
          padding: "20px 24px",
          display: "flex", alignItems: "center", gap: "16px",
        }}>
          <button
            type="button"
            onClick={() => { void handleMerge(); }}
            disabled={merging || slaveCount === 0}
            style={{
              padding: "10px 24px", borderRadius: "7px", border: "none",
              fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
              cursor: merging || slaveCount === 0 ? "not-allowed" : "pointer",
              background: merging || slaveCount === 0 ? "#f1f3f7" : "#2563eb",
              color: merging || slaveCount === 0 ? "#9ca3af" : "#fff",
              transition: "background 0.15s",
            }}
          >
            {merging ? "Merger…" : `Merge ${slaveCount} records ind i master`}
          </button>
          {slaveCount > 0 && (
            <span style={{ fontSize: "12px", color: "#888" }}>
              {consolidatedArticles} artikler konsolideres
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
