"use client";

import { useState } from "react";
import Link from "next/link";

interface ArticleItem {
  id:            string;
  title:         string;
  journal_abbr:  string | null;
  published_date: string | null;
  saved_id:      string;
}

interface Project {
  id:         string;
  name:       string;
  created_at: string;
}

interface Props {
  projects:        Project[];
  unsorted:        ArticleItem[];
  projectArticles: { project: Project; articles: ArticleItem[] }[];
}

function ArticleRow({ item, onRemove }: { item: ArticleItem; onRemove: (id: string) => void }) {
  const meta = [item.journal_abbr, item.published_date?.slice(0, 7)].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderTop: "1px solid #f0f0f0" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link href={`/articles/${item.id}`} style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}>
          {item.title}
        </Link>
        {meta && <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{meta}</div>}
      </div>
      <button
        onClick={() => onRemove(item.id)}
        title="Remove"
        style={{ marginLeft: "16px", flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "18px", lineHeight: 1, padding: "2px 6px" }}
      >
        ×
      </button>
    </div>
  );
}

export default function SavedPageClient({ projects: initialProjects, unsorted: initialUnsorted, projectArticles: initial }: Props) {
  const [unsorted,        setUnsorted]        = useState(initialUnsorted);
  const [projectArticles, setProjectArticles] = useState(initial);
  const [newProjectName,  setNewProjectName]  = useState("");
  const [showInput,       setShowInput]       = useState(false);

  async function removeArticle(articleId: string) {
    await fetch(`/api/articles/${articleId}/save`, { method: "DELETE" });
    setUnsorted((prev) => prev.filter((a) => a.id !== articleId));
    setProjectArticles((prev) => prev.map((pa) => ({ ...pa, articles: pa.articles.filter((a) => a.id !== articleId) })));
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

  const card: React.CSSProperties = { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginBottom: "16px" };
  const cardHeader = (label: string, onDelete?: () => void): React.ReactNode => (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
          : unsorted.map((item) => <ArticleRow key={item.id} item={item} onRemove={removeArticle} />)
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
              : articles.map((item) => <ArticleRow key={item.id} item={item} onRemove={removeArticle} />)
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
