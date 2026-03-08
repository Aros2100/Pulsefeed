"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Author {
  id: string;
  display_name: string;
  affiliations: string[] | null;
  article_count: number | null;
  author_score: number | null;
  orcid: string | null;
}

interface DuplicateGroup {
  display_name: string;
  count: number;
  authors: Author[];
}

function AuthorScoreBadge({ score }: { score: number }) {
  const bg = score >= 35 ? "#f0fdf4" : score >= 15 ? "#fffbeb" : "#fef2f2";
  const color = score >= 35 ? "#15803d" : score >= 15 ? "#d97706" : "#b91c1c";
  return (
    <span style={{ fontSize: "12px", fontWeight: 700, borderRadius: "6px", padding: "2px 8px", background: bg, color }}>
      {score}
    </span>
  );
}

export default function MergeClient() {
  const router = useRouter();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Author[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selected, setSelected] = useState<Map<string, Author>>(new Map());
  const [masterId, setMasterId] = useState<string | null>(null);

  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch duplicate groups
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/authors/duplicates");
        const json = await res.json();
        if (json.ok) setGroups(json.groups);
      } finally {
        setLoadingGroups(false);
      }
    })();
  }, []);

  // Search authors
  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("authors")
        .select("id, display_name, affiliations, article_count, author_score, orcid")
        .ilike("display_name", `%${query.trim()}%`)
        .order("article_count", { ascending: false, nullsFirst: false })
        .limit(30);
      setSearchResults((data as unknown as Author[]) ?? []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggleSelect = useCallback((author: Author) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(author.id)) {
        next.delete(author.id);
      } else {
        next.set(author.id, author);
      }
      return next;
    });
  }, []);

  const selectGroup = useCallback((group: DuplicateGroup) => {
    const next = new Map<string, Author>();
    for (const a of group.authors) {
      next.set(a.id, a);
    }
    setSelected(next);
    setMasterId(null);
    setQuery(group.display_name);
  }, []);

  // Auto-select master: the one with most articles
  useEffect(() => {
    if (selected.size < 2) {
      setMasterId(null);
      return;
    }
    if (masterId && selected.has(masterId)) return;
    const best = Array.from(selected.values()).sort(
      (a, b) => (b.article_count ?? 0) - (a.article_count ?? 0)
    )[0];
    setMasterId(best.id);
  }, [selected, masterId]);

  const selectedAuthors = Array.from(selected.values());
  const duplicateIds = selectedAuthors.filter((a) => a.id !== masterId).map((a) => a.id);
  const master = masterId ? selected.get(masterId) : null;
  const totalArticles = duplicateIds.reduce((sum, id) => {
    const a = selected.get(id);
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
      router.push(`/admin/authors/${masterId}`);
    } catch {
      setError("Network error");
      setMerging(false);
    }
  };

  // Determine display list: search results + any selected not in search results
  const displayAuthors: Author[] = [];
  const seen = new Set<string>();

  // Show selected first
  for (const a of selectedAuthors) {
    displayAuthors.push(a);
    seen.add(a.id);
  }
  // Then search results not already shown
  for (const a of searchResults) {
    if (!seen.has(a.id)) {
      displayAuthors.push(a);
      seen.add(a.id);
    }
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/authors" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Forfattere
          </Link>
        </div>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>Merge forfattere</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>
            Vælg 2+ forfattere og flet dem til én profil
          </div>
        </div>

        {/* Auto-detect duplicates */}
        <div style={{
          background: "#fff", borderRadius: "10px", marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              {loadingGroups ? "Finder duplikater…" : `${groups.length} grupper med identisk navn`}
            </div>
          </div>

          {!loadingGroups && groups.length === 0 && (
            <div style={{ padding: "16px 24px", fontSize: "14px", color: "#888" }}>
              Ingen duplikater fundet.
            </div>
          )}

          {groups.slice(0, 30).map((group, i) => (
            <button
              key={group.display_name}
              onClick={() => selectGroup(group)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "12px 24px", background: "transparent",
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
        </div>

        {/* Search */}
        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder="Søg forfatter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              border: "1px solid #d1d5db", borderRadius: "8px",
              padding: "10px 14px", fontSize: "14px", color: "#1a1a1a",
              outline: "none", background: "#fff",
            }}
          />
        </div>

        {/* Author list */}
        {(displayAuthors.length > 0 || searchLoading) && (
          <div style={{
            background: "#fff", borderRadius: "10px", marginBottom: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}>
            <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
                {searchLoading ? "Søger…" : `${displayAuthors.length} forfattere · ${selected.size} valgt`}
              </div>
            </div>

            {displayAuthors.map((author, i) => {
              const isSelected = selected.has(author.id);
              const isMaster = author.id === masterId;
              return (
                <div
                  key={author.id}
                  onClick={() => toggleSelect(author)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 24px", cursor: "pointer",
                    borderTop: i === 0 ? undefined : "1px solid #f0f0f0",
                    background: isMaster ? "#f0fdf4" : isSelected ? "#f8fafc" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(author)}
                      style={{ flexShrink: 0, accentColor: "#15803d" }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>
                        {author.display_name}
                        {author.orcid && (
                          <span style={{ fontSize: "11px", color: "#5a6a85", marginLeft: "6px", fontWeight: 400 }}>
                            ORCID
                          </span>
                        )}
                        {isMaster && (
                          <span style={{
                            fontSize: "11px", fontWeight: 700, color: "#15803d",
                            marginLeft: "8px", background: "#dcfce7", borderRadius: "4px", padding: "1px 6px",
                          }}>
                            MASTER
                          </span>
                        )}
                      </div>
                      {author.affiliations && author.affiliations.length > 0 && (
                        <div style={{
                          fontSize: "12px", color: "#888", marginTop: "2px",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: "550px",
                        }}>
                          {author.affiliations[0]}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginLeft: "16px", flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    {author.author_score != null && (
                      <AuthorScoreBadge score={author.author_score} />
                    )}
                    <span style={{
                      fontSize: "12px", fontWeight: 600, color: "#fff", background: "#5a6a85",
                      borderRadius: "10px", padding: "2px 8px",
                    }}>
                      {author.article_count ?? 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Merge panel */}
        {selected.size >= 2 && (
          <div style={{
            background: "#fff", borderRadius: "10px", padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            position: "sticky", bottom: "24px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>
              Merge-panel
            </div>

            <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "12px" }}>
              Vælg master (primær profil):
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
              {selectedAuthors.map((a) => (
                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                  <input
                    type="radio"
                    name="master"
                    checked={masterId === a.id}
                    onChange={() => setMasterId(a.id)}
                    style={{ accentColor: "#15803d" }}
                  />
                  <span style={{ fontWeight: masterId === a.id ? 700 : 400 }}>
                    {a.display_name}
                  </span>
                  <span style={{ fontSize: "12px", color: "#888" }}>
                    ({a.article_count ?? 0} artikler)
                  </span>
                </label>
              ))}
            </div>

            <div style={{
              fontSize: "13px", color: "#1a1a1a", background: "#EEF2F7",
              borderRadius: "6px", padding: "10px 14px", marginBottom: "16px",
            }}>
              Merger {duplicateIds.length} forfatter{duplicateIds.length > 1 ? "e" : ""} → <strong>{master?.display_name}</strong>.
              {" "}{totalArticles} artikel{totalArticles !== 1 ? "er" : ""} flyttes.
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
                padding: "10px 24px", fontSize: "14px", fontWeight: 700,
                background: merging ? "#9ca3af" : "#b91c1c", color: "#fff",
                border: "none", borderRadius: "8px", cursor: merging ? "default" : "pointer",
              }}
            >
              {merging ? "Merger…" : `Bekræft merge (${selected.size} → 1)`}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
