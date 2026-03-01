"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        marginTop: "12px",
        fontSize: "12px", color: "#5a6a85",
        background: "#fff", border: "1px solid #dde3ed",
        borderRadius: "6px", padding: "6px 14px", cursor: "pointer",
      }}
    >
      {copied ? "✓ Copied" : "Copy Vancouver"}
    </button>
  );
}
