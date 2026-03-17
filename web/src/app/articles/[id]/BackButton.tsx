"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      style={{
        fontSize: "13px",
        padding: "6px 12px",
        borderRadius: "6px",
        border: "1px solid #dde3ed",
        background: "#fff",
        color: "#5a6a85",
        cursor: "pointer",
      }}
    >
      ← Tilbage
    </button>
  );
}
