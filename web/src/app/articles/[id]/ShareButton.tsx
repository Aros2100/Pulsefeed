"use client";

import { useState } from "react";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      style={{
        fontSize: "13px", fontWeight: 600, padding: "6px 14px", borderRadius: "8px",
        border: "1px solid #dde3ed", background: "#fff", color: "#5a6a85", cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {copied ? "Copied!" : "Share"}
    </button>
  );
}
