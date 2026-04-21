"use client";

import { useState } from "react";

interface Props {
  pubmed:         React.ReactNode;
  classification: React.ReactNode;
  condensation:   React.ReactNode;
  scoring:        React.ReactNode;
  location:       React.ReactNode;
  import_:        React.ReactNode;
  log:            React.ReactNode;
  bibliometrics:  React.ReactNode;
  note:           React.ReactNode;
}

type Tab = "pubmed" | "classification" | "condensation" | "scoring" | "location" | "import_" | "log" | "bibliometrics" | "note";

export default function AdminArticleTabs({ pubmed, classification, condensation, scoring, location, import_, log, bibliometrics, note }: Props) {
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
        <button style={tabStyle(tab === "pubmed")}         onClick={() => setTab("pubmed")}>PubMed</button>
        <button style={tabStyle(tab === "classification")} onClick={() => setTab("classification")}>Classification</button>
        <button style={tabStyle(tab === "condensation")}   onClick={() => setTab("condensation")}>Condensation</button>
        <button style={tabStyle(tab === "scoring")}        onClick={() => setTab("scoring")}>Scoring</button>
        <button style={tabStyle(tab === "location")}       onClick={() => setTab("location")}>Location</button>
        <button style={tabStyle(tab === "import_")}        onClick={() => setTab("import_")}>Import</button>
        <button style={tabStyle(tab === "log")}            onClick={() => setTab("log")}>Log</button>
        <button style={tabStyle(tab === "bibliometrics")}  onClick={() => setTab("bibliometrics")}>Bibliometrics</button>
        <button style={tabStyle(tab === "note")}           onClick={() => setTab("note")}>Note</button>
      </div>

      {tab === "pubmed"         && pubmed}
      {tab === "classification" && classification}
      {tab === "condensation"   && condensation}
      {tab === "scoring"        && scoring}
      {tab === "location"       && location}
      {tab === "import_"        && import_}
      {tab === "log"            && log}
      {tab === "bibliometrics"  && bibliometrics}
      {tab === "note"           && note}
    </div>
  );
}
