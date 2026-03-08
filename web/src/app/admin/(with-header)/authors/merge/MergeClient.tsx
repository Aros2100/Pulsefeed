"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────── */

interface DuplicateGroup {
  display_name: string;
  count: number;
  authors: { id: string; display_name: string; article_count: number | null }[];
}

interface Article {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
}

interface AuthorDetail {
  id: string;
  display_name: string;
  affiliations: string[] | null;
  article_count: number | null;
  orcid: string | null;
  articles: Article[];
}

/* ── Shared components ─────────────────────────────────── */

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#fff", borderRadius: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
        {children}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────── */

export default function MergeClient() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Step 2 state
  const [activeGroup, setActiveGroup] = useState<DuplicateGroup | null>(null);
  const [details, setDetails] = useState<AuthorDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [masterId, setMasterId] = useState<string | null>(null);

  // Step 3 state
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Fetch duplicate groups (step 1) ─── */
  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch("/api/admin/authors/duplicates");
      const json = await res.json();
      if (json.ok) setGroups(json.groups);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  /* ── Select group → fetch details (step 2) ─── */
  const openGroup = useCallback(async (group: DuplicateGroup) => {
    setActiveGroup(group);
    setDetails([]);
    setMasterId(null);
    setError(null);
    setLoadingDetails(true);

    const ids = group.authors.map((a) => a.id).join(",");
    try {
      const res = await fetch(`/api/admin/authors/details?ids=${ids}`);
      const json = await res.json();
      if (json.ok) {
        const sorted = (json.authors as AuthorDetail[]).sort(
          (a, b) => (b.article_count ?? 0) - (a.article_count ?? 0)
        );
        setDetails(sorted);
        // Auto-select the one with most articles as master
        if (sorted.length > 0) setMasterId(sorted[0].id);
      }
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  /* ── Back to list ─── */
  const backToList = useCallback(() => {
    setActiveGroup(null);
    setDetails([]);
    setMasterId(null);
    setError(null);
  }, []);

  /* ── Merge (step 3) ─── */
  const duplicateIds = details.filter((a) => a.id !== masterId).map((a) => a.id);
  const master = details.find((a) => a.id === masterId) ?? null;
  const totalArticlesMoved = duplicateIds.reduce((sum, id) => {
    const a = details.find((d) => d.id === id);
    return sum + (a?.article_count ?? 0);
  }, 0);

  const handleMerge = async () => {
    if (!masterId || duplicateIds.length === 0) return;
    setMerging(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/authors/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterId, duplicateIds }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Merge failed");
        setMerging(false);
        return;
      }
      // Success → remove this group from the list and go back to step 1
      setGroups((prev) => prev.filter((g) => g !== activeGroup));
      backToList();
    } catch {
      setError("Network error");
      setMerging(false);
    }
  };

  /* ── Render ─── */
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          {activeGroup ? (
            <button
              onClick={backToList}
              style={{ fontSize: "13px", color: "#5a6a85", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              ← Tilbage til listen
            </button>
          ) : (
            <Link href="/admin/authors" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
              ← Forfattere
            </Link>
          )}
        </div>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>
            {activeGroup ? activeGroup.display_name : "Merge forfattere"}
          </div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>
            {activeGroup
              ? `${activeGroup.count} profiler med dette navn — vælg master`
              : "Duplikat-grupper med identisk navn"}
          </div>
        </div>

        {/* ═══ STEP 1: Group list ═══ */}
        {!activeGroup && (
          <Card>
            <CardHeader>
              {loadingGroups ? "Finder duplikater…" : `${groups.length} grupper`}
            </CardHeader>

            {!loadingGroups && groups.length === 0 && (
              <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>
                Ingen duplikater fundet.
              </div>
            )}

            {groups.map((group, i) => (
              <button
                key={group.display_name}
                onClick={() => openGroup(group)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "14px 24px", background: "transparent",
                  border: "none", borderTop: i === 0 ? undefined : "1px solid #f0f0f0",
                  cursor: "pointer", textAlign: "left", fontSize: "14px", color: "#1a1a1a",
                }}
              >
                <span style={{ fontWeight: 600 }}>{group.display_name}</span>
                <span style={{
                  fontSize: "12px", fontWeight: 600, color: "#fff", background: "#b91c1c",
                  borderRadius: "10px", padding: "2px 10px",
                }}>
                  {group.count} stk
                </span>
              </button>
            ))}
          </Card>
        )}

        {/* ═══ STEP 2 + 3: Author cards + merge confirm ═══ */}
        {activeGroup && (
          <>
            {loadingDetails && (
              <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>
                Henter forfatterdata…
              </div>
            )}

            {!loadingDetails && details.map((author) => {
              const isMaster = author.id === masterId;
              return (
                <Card key={author.id} style={{ marginBottom: "16px", border: isMaster ? "2px solid #15803d" : "2px solid transparent" }}>
                  {/* Author header with radio */}
                  <div style={{
                    padding: "16px 24px", display: "flex", alignItems: "center", gap: "12px",
                    background: isMaster ? "#f0fdf4" : undefined,
                    borderBottom: "1px solid #f0f0f0",
                  }}>
                    <input
                      type="radio"
                      name="master"
                      checked={isMaster}
                      onChange={() => setMasterId(author.id)}
                      style={{ accentColor: "#15803d", width: "16px", height: "16px", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a" }}>
                        {author.display_name}
                        {isMaster && (
                          <span style={{
                            fontSize: "11px", fontWeight: 700, color: "#15803d",
                            marginLeft: "8px", background: "#dcfce7", borderRadius: "4px", padding: "2px 8px",
                          }}>
                            MASTER
                          </span>
                        )}
                      </div>
                      {author.orcid && (
                        <div style={{ fontSize: "12px", color: "#5a6a85", marginTop: "2px" }}>
                          ORCID: {author.orcid}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <span style={{
                        fontSize: "12px", fontWeight: 600, color: "#fff", background: "#5a6a85",
                        borderRadius: "10px", padding: "2px 10px",
                      }}>
                        {author.article_count ?? 0} artikler
                      </span>
                    </div>
                  </div>

                  {/* Affiliations */}
                  {author.affiliations && author.affiliations.length > 0 && (
                    <div style={{ padding: "12px 24px", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                        Affilieringer
                      </div>
                      {author.affiliations.map((aff, j) => (
                        <div key={j} style={{ fontSize: "13px", color: "#444", lineHeight: 1.5 }}>
                          {aff}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Articles */}
                  {author.articles.length > 0 && (
                    <div style={{ padding: "12px 24px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                        Artikler ({author.articles.length})
                      </div>
                      {author.articles.map((art) => (
                        <div key={art.id} style={{ marginBottom: "8px" }}>
                          <a
                            href={`/admin/articles/${art.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "13px", color: "#1a6dca", textDecoration: "none", fontWeight: 500, lineHeight: 1.4, display: "block" }}
                          >
                            {art.title}
                          </a>
                          <div style={{ fontSize: "12px", color: "#888", marginTop: "1px" }}>
                            {[art.journal_abbr, art.published_date].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {author.articles.length === 0 && (
                    <div style={{ padding: "12px 24px", fontSize: "13px", color: "#aaa" }}>
                      Ingen artikler linket.
                    </div>
                  )}
                </Card>
              );
            })}

            {/* ═══ STEP 3: Merge confirmation ═══ */}
            {!loadingDetails && details.length >= 2 && masterId && (
              <Card style={{ marginTop: "8px" }}>
                <div style={{ padding: "20px 24px" }}>
                  <div style={{
                    fontSize: "14px", color: "#1a1a1a", background: "#EEF2F7",
                    borderRadius: "8px", padding: "14px 18px", marginBottom: "16px", lineHeight: 1.6,
                  }}>
                    <strong>Master:</strong> {master?.display_name} ({master?.article_count ?? 0} artikler).
                    {" "}Merger {duplicateIds.length} duplikat{duplicateIds.length > 1 ? "er" : ""}.
                    {" "}{totalArticlesMoved} artikel{totalArticlesMoved !== 1 ? "er" : ""} flyttes.
                  </div>

                  {error && (
                    <div style={{ fontSize: "13px", color: "#b91c1c", marginBottom: "12px" }}>
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleMerge}
                    disabled={merging}
                    style={{
                      padding: "10px 28px", fontSize: "14px", fontWeight: 700,
                      background: merging ? "#9ca3af" : "#b91c1c", color: "#fff",
                      border: "none", borderRadius: "8px", cursor: merging ? "default" : "pointer",
                    }}
                  >
                    {merging ? "Merger…" : `Bekræft merge (${details.length} → 1)`}
                  </button>
                </div>
              </Card>
            )}
          </>
        )}

      </div>
    </div>
  );
}
