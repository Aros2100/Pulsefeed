"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { triggerBackgroundCron } from "../_lib/triggerBackgroundCron";

export function ManualTriggerButton({ job }: { job: "poll" | "ingest" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    setState("running");
    setResult(null);
    try {
      const data = await triggerBackgroundCron(job);
      setResult(JSON.stringify(data));
      setState("ok");
      setTimeout(() => { setState("idle"); setResult(null); }, 5000);
      router.refresh();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Unknown error");
      setState("error");
      setTimeout(() => { setState("idle"); setResult(null); }, 8000);
    }
  }

  return (
    <div style={{ marginTop: "16px" }}>
      <button
        onClick={handleClick}
        disabled={state === "running"}
        style={{
          fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
          background: state === "running" ? "#94a3b8" : "#1a1a1a",
          color: "#fff", border: "none", borderRadius: "7px",
          padding: "8px 18px",
          cursor: state === "running" ? "default" : "pointer",
        }}
      >
        {state === "running" ? "Running…" : `Run ${job} now`}
      </button>

      {state === "ok" && (
        <span style={{ marginLeft: "12px", fontSize: "12px", color: "#15803d", fontWeight: 500 }}>
          ✅ Done
        </span>
      )}
      {state === "error" && (
        <span style={{ marginLeft: "12px", fontSize: "12px", color: "#b91c1c" }}>
          ❌ {result}
        </span>
      )}
      {state === "ok" && result && (
        <div style={{
          marginTop: "8px", fontSize: "11px", fontFamily: "monospace",
          background: "#f0fdf4", border: "1px solid #86efac",
          borderRadius: "6px", padding: "8px 12px", color: "#14532d",
          maxWidth: "600px", overflowX: "auto",
        }}>
          {result}
        </div>
      )}
    </div>
  );
}
