"use client";

import { useState, useEffect, useRef } from "react";

interface Project { id: string; name: string }

interface Props {
  articleId:        string;
  initialSaved:     boolean;
  initialProjectId: string | null;
  projects:         Project[];
}

export default function SaveButton({ articleId, initialSaved, initialProjectId, projects: initialProjects }: Props) {
  const [saved,      setSaved]      = useState(initialSaved);
  const [projectId,  setProjectId]  = useState(initialProjectId);
  const [open,       setOpen]       = useState(false);
  const [projects,   setProjects]   = useState(initialProjects);
  const [newName,    setNewName]    = useState("");
  const [showInput,  setShowInput]  = useState(false);
  const [loading,    setLoading]    = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function doSave(pid: string | null) {
    setLoading(true);
    const res = await fetch(`/api/articles/${articleId}/save`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ project_id: pid }),
    });
    if (res.ok) { setSaved(true); setProjectId(pid); }
    setLoading(false);
    setOpen(false);
  }

  async function doUnsave() {
    setLoading(true);
    const res = await fetch(`/api/articles/${articleId}/save`, { method: "DELETE" });
    if (res.ok) { setSaved(false); setProjectId(null); }
    setLoading(false);
  }

  async function createProject() {
    const name = newName.trim();
    if (!name) return;
    const res  = await fetch("/api/projects", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name }),
    });
    const data = await res.json() as { ok: boolean; project?: Project };
    if (data.ok && data.project) {
      setProjects((prev) => [data.project!, ...prev]);
      setNewName("");
      setShowInput(false);
      void doSave(data.project.id);
    }
  }

  const iconColor = saved ? "#E83B2A" : "#9ca3af";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => saved ? doUnsave() : setOpen((v) => !v)}
        disabled={loading}
        title={saved ? "Remove from saved" : "Save article"}
        style={{ background: "none", border: "none", cursor: loading ? "wait" : "pointer", padding: "4px", display: "flex", alignItems: "center" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? iconColor : "none"} stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, zIndex: 50,
          background: "#fff", borderRadius: "8px", minWidth: "200px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}>
          <button
            onClick={() => doSave(null)}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: "13px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f7fa")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            Save (no project)
          </button>

          {projects.length > 0 && (
            <>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", padding: "6px 14px 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Projects</div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => doSave(p.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", fontSize: "13px", background: p.id === projectId ? "#eff6ff" : "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f7fa")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = p.id === projectId ? "#eff6ff" : "none")}
                >
                  {p.name}
                </button>
              ))}
            </>
          )}

          <div style={{ borderTop: "1px solid #f0f0f0" }}>
            {showInput ? (
              <div style={{ padding: "8px 10px", display: "flex", gap: "6px" }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void createProject(); if (e.key === "Escape") setShowInput(false); }}
                  placeholder="Project name…"
                  style={{ flex: 1, fontSize: "13px", padding: "5px 8px", borderRadius: "6px", border: "1px solid #dde3ed", outline: "none" }}
                />
                <button onClick={() => void createProject()} style={{ fontSize: "12px", padding: "5px 8px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>Add</button>
              </div>
            ) : (
              <button
                onClick={() => setShowInput(true)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: "13px", color: "#5a6a85", background: "none", border: "none", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f7fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                + New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
