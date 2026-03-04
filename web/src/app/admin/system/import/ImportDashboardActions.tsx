"use client";

import { useState } from "react";

interface Props {
  specialtySlugs: string[];
  subset: "articles" | "linking";
}

type ActionState = "idle" | "loading" | "done" | "error";

export default function ImportDashboardActions({ specialtySlugs, subset }: Props) {
  const [c1State,   setC1State]   = useState<ActionState>("idle");
  const [c2State,   setC2State]   = useState<ActionState>("idle");
  const [linkState, setLinkState] = useState<ActionState>("idle");

  async function triggerC1() {
    setC1State("loading");
    try {
      const res  = await fetch("/api/admin/pubmed/trigger-import", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      setC1State(json.ok ? "done" : "error");
    } catch { setC1State("error"); }
  }

  async function triggerC2() {
    setC2State("loading");
    try {
      for (const slug of specialtySlugs) {
        await fetch(`/api/admin/pubmed/trigger-import-circle2?specialty=${slug}`, { method: "POST" });
      }
      setC2State("done");
    } catch { setC2State("error"); }
  }

  async function triggerLinking() {
    setLinkState("loading");
    try {
      const res  = await fetch("/api/admin/author-linking/start", { method: "POST" });
      const json = (await res.json()) as { ok: boolean };
      setLinkState(json.ok ? "done" : "error");
    } catch { setLinkState("error"); }
  }

  const allActions: { label: string; state: ActionState; trigger: () => Promise<void>; group: "articles" | "linking" }[] = [
    { label: "Kør C1 import",         state: c1State,   trigger: triggerC1,      group: "articles" },
    { label: "Kør C2 import",         state: c2State,   trigger: triggerC2,      group: "articles" },
    { label: "Kør forfatter-linking",  state: linkState, trigger: triggerLinking, group: "linking"  },
  ];
  const actions = allActions.filter((a) => a.group === subset);

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      {actions.map(({ label, state, trigger }) => {
        const bg    = state === "done"    ? "#f0fdf4"
                    : state === "error"   ? "#fef2f2"
                    : state === "loading" ? "#f1f3f7"
                    :                       "#E83B2A";
        const color = state === "done"    ? "#15803d"
                    : state === "error"   ? "#b91c1c"
                    : state === "loading" ? "#9ca3af"
                    :                       "#fff";
        const btnLabel = state === "loading" ? "Starter…"
                       : state === "done"    ? "Startet ✓"
                       : state === "error"   ? "Fejl — prøv igen"
                       :                       label;
        return (
          <button
            key={label}
            onClick={() => { void trigger(); }}
            disabled={state === "loading"}
            style={{
              padding: "8px 16px",
              borderRadius: "7px",
              border: "none",
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              cursor: state === "loading" ? "not-allowed" : "pointer",
              background: bg,
              color,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {btnLabel}
          </button>
        );
      })}
    </div>
  );
}
