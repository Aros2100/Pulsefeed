"use client";

import { useState } from "react";

interface Props {
  pubmed:   React.ReactNode;
  historik: React.ReactNode;
}

export default function AdminArticleTabs({ pubmed, historik }: Props) {
  const [tab, setTab] = useState<"pubmed" | "historik">("pubmed");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    fontSize: "13px",
    fontWeight: active ? 700 : 500,
    color: active ? "#1a1a1a" : "#5a6a85",
    background: active ? "#fff" : "transparent",
    border: "1px solid",
    borderColor: active ? "#dde3ed" : "transparent",
    borderBottom: active ? "1px solid #fff" : "1px solid #dde3ed",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
    position: "relative",
    bottom: "-1px",
    outline: "none",
  });

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #dde3ed", marginBottom: "20px" }}>
        <button style={tabStyle(tab === "pubmed")}   onClick={() => setTab("pubmed")}>PubMed</button>
        <button style={tabStyle(tab === "historik")} onClick={() => setTab("historik")}>Historik</button>
      </div>

      {tab === "pubmed"   && pubmed}
      {tab === "historik" && historik}
    </div>
  );
}
