"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface ArticleItem {
  id:             string;
  title:          string;
  journal_abbr:   string | null;
  published_date: string | null;
  saved_id:       string;
}

interface Project {
  id:         string;
  name:       string;
  created_at: string | null;
}

interface Props {
  projects:        Project[];
  unsorted:        ArticleItem[];
  projectArticles: { project: Project; articles: ArticleItem[] }[];
}

// ── Dropdown item ──────────────────────────────────────────────────────────────

function DropdownItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        padding: "8px 14px", fontSize: "13px", cursor: "pointer",
        color: active ? "#E83B2A" : "#1a1a1a",
        background: hovered ? "#f5f7fa" : "transparent",
        display: "flex", alignItems: "center", gap: "6px",
      }}
    >
      <span style={{ width: "14px", flexShrink: 0 }}>{active ? "✓" : ""}</span>
      {label}
    </div>
  );
}

// ── Move dropdown ─────────────────────────────────────────────────────────────

function MoveDropdown({
  projects,
  currentProjectId,
  onMove,
  onClose,
}: {
  projects:         Project[];
  currentProjectId: string | null;
  onMove:           (projectId: string | null) => void;
  onClose:          () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50,
        background: "#fff", borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        border: "1px solid #eee", minWidth: "180px", overflow: "hidden",
      }}
    >
      <DropdownItem
        label="No project"
        active={currentProjectId === null}
        onClick={() => { onMove(null); onClose(); }}
      />
      {projects.length > 0 && <div style={{ height: "1px", background: "#f0f0f0", margin: "2px 0" }} />}
      {projects.map((p) => (
        <DropdownItem
          key={p.id}
          label={p.name}
          active={currentProjectId === p.id}
          onClick={() => { onMove(p.id); onClose(); }}
        />
      ))}
    </div>
  );
}

// ── Article row ───────────────────────────────────────────────────────────────

function ArticleRow({
  item,
  projects,
  currentProjectId,
  onRemove,
  onMove,
}: {
  item:             ArticleItem;
  projects:         Project[];
  currentProjectId: string | null;
  onRemove:         (id: string) => void;
  onMove:           (articleId: string, projectId: string | null) => void;
}) {
  const [showMove, setShowMove] = useState(false);
  const meta = [item.journal_abbr, item.published_date?.slice(0, 7)].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderTop: "1px solid #f0f0f0" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link href={`/articles/${item.id}`} style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}>
          {item.title}
        </Link>
        {meta && <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{meta}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "16px", flexShrink: 0 }}>
        {/* Move button */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowMove((v) => !v)}
            style={{
              background: "none", border: "1px solid #dde3ed", borderRadius: "6px",
              cursor: "pointer", color: "#5a6a85", fontSize: "12px", padding: "3px 10px",
            }}
          >
            Move →
          </button>
          {showMove && (
            <MoveDropdown
              projects={projects}
              currentProjectId={currentProjectId}
              onMove={(projectId) => onMove(item.id, projectId)}
              onClose={() => setShowMove(false)}
            />
          )}
        </div>
        {/* Remove button */}
        <button
          onClick={() => onRemove(item.id)}
          title="Remove"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "18px", lineHeight: 1, padding: "2px 6px" }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Page client ───────────────────────────────────────────────────────────────

export default function SavedPageClient({ projects: _p, unsorted: initialUnsorted, projectArticles: initial }: Props) {
  const [unsorted,        setUnsorted]        = useState(initialUnsorted);
  const [projectArticles, setProjectArticles] = useState(initial);
  const [newProjectName,  setNewProjectName]  = useState("");
  const [showInput,       setShowInput]       = useState(false);

  // Derive project list from current state so newly created projects appear immediately
  const allProjects = projectArticles.map((pa) => pa.project);

  async function removeArticle(articleId: string) {
    await fetch(`/api/articles/${articleId}/save`, { method: "DELETE" });
    setUnsorted((prev) => prev.filter((a) => a.id !== articleId));
    setProjectArticles((prev) => prev.map((pa) => ({ ...pa, articles: pa.articles.filter((a) => a.id !== articleId) })));
  }

  async function moveArticle(articleId: string, projectId: string | null) {
    // Find the article in current state (sync read from closure is fine here)
    let article: ArticleItem | undefined =
      unsorted.find((a) => a.id === articleId) ??
      projectArticles.flatMap((pa) => pa.articles).find((a) => a.id === articleId);
    if (!article) return;

    const art = article;

    // Optimistic update: remove from old location, add to new
    setUnsorted((prev) => {
      const without = prev.filter((a) => a.id !== articleId);
      return projectId === null ? [...without, art] : without;
    });
    setProjectArticles((prev) =>
      prev.map((pa) => {
        const without = pa.articles.filter((a) => a.id !== articleId);
        const articles = pa.project.id === projectId ? [...without, art] : without;
        return { ...pa, articles };
      })
    );

    // Persist
    await fetch(`/api/articles/${articleId}/save`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
  }

  async function deleteProject(projectId: string) {
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setProjectArticles((prev) => prev.filter((pa) => pa.project.id !== projectId));
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const res  = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await res.json() as { ok: boolean; project?: Project };
    if (data.ok && data.project) {
      setProjectArticles((prev) => [{ project: data.project!, articles: [] }, ...prev]);
      setNewProjectName("");
      setShowInput(false);
    }
  }

  const card: React.CSSProperties = { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", marginBottom: "16px" };
  const cardHeader = (label: string, onDelete?: () => void): React.ReactNode => (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "10px 10px 0 0" }}>
      <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
      {onDelete && (
        <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "16px", lineHeight: 1, padding: "0 4px" }} title="Delete project">×</button>
      )}
    </div>
  );

  return (
    <div>
      {/* Unsorted */}
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>Unsorted</div>
      <div style={card}>
        {cardHeader(`Unsorted · ${unsorted.length} articles`)}
        {unsorted.length === 0
          ? <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>No unsorted articles</div>
          : unsorted.map((item) => (
              <ArticleRow
                key={item.id} item={item}
                projects={allProjects} currentProjectId={null}
                onRemove={removeArticle} onMove={moveArticle}
              />
            ))
        }
      </div>

      {/* Projects */}
      {projectArticles.map(({ project, articles }) => (
        <div key={project.id}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px", marginTop: "20px" }}>
            {project.name}
          </div>
          <div style={card}>
            {cardHeader(`${project.name} · ${articles.length} articles`, () => deleteProject(project.id))}
            {articles.length === 0
              ? <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>No articles in this project</div>
              : articles.map((item) => (
                  <ArticleRow
                    key={item.id} item={item}
                    projects={allProjects} currentProjectId={project.id}
                    onRemove={removeArticle} onMove={moveArticle}
                  />
                ))
            }
          </div>
        </div>
      ))}

      {/* New project */}
      <div style={{ marginTop: "20px" }}>
        {showInput ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void createProject(); if (e.key === "Escape") setShowInput(false); }}
              placeholder="Project name…"
              style={{ fontSize: "13px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #dde3ed", outline: "none", flex: 1, maxWidth: "280px" }}
            />
            <button onClick={() => void createProject()} style={{ fontSize: "13px", padding: "8px 16px", borderRadius: "8px", background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>Create</button>
            <button onClick={() => setShowInput(false)} style={{ fontSize: "13px", padding: "8px 16px", borderRadius: "8px", background: "none", color: "#5a6a85", border: "1px solid #dde3ed", cursor: "pointer" }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowInput(true)} style={{ fontSize: "13px", color: "#5a6a85", background: "none", border: "1.5px dashed #c7d2e0", padding: "10px 20px", borderRadius: "8px", cursor: "pointer" }}>
            + New project
          </button>
        )}
      </div>
    </div>
  );
}
