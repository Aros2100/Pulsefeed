"use client";

import { useState } from "react";

interface Props {
  pubmed:      React.ReactNode;
  aiScoring:   React.ReactNode;
  geo:         React.ReactNode;
  import_:     React.ReactNode;
  historik:    React.ReactNode;
  bibliometri: React.ReactNode;
  note:        React.ReactNode;
}

type Tab = "pubmed" | "aiScoring" | "geo" | "import_" | "historik" | "bibliometri" | "note";

export default function AdminArticleTabs({ pubmed, aiScoring, geo, import_, historik, bibliometri, note }: Props) {
  const [tab, setTab] = useState<Tab>("pubmed");

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
        <button style={tabStyle(tab === "pubmed")}      onClick={() => setTab("pubmed")}>PubMed</button>
        <button style={tabStyle(tab === "aiScoring")}   onClick={() => setTab("aiScoring")}>AI-scoring</button>
        <button style={tabStyle(tab === "geo")}         onClick={() => setTab("geo")}>Geo</button>
        <button style={tabStyle(tab === "import_")}     onClick={() => setTab("import_")}>Import</button>
        <button style={tabStyle(tab === "historik")}    onClick={() => setTab("historik")}>Historik</button>
        <button style={tabStyle(tab === "bibliometri")} onClick={() => setTab("bibliometri")}>Bibliometri</button>
        <button style={tabStyle(tab === "note")}        onClick={() => setTab("note")}>Note</button>
      </div>

      {tab === "pubmed"      && pubmed}
      {tab === "aiScoring"   && aiScoring}
      {tab === "geo"         && geo}
      {tab === "import_"     && import_}
      {tab === "historik"    && historik}
      {tab === "bibliometri" && bibliometri}
      {tab === "note"        && note}
    </div>
  );
}
