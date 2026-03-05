"use client";

import { useState } from "react";

interface Props {
  authorId:    string;
  onUnfollow?: () => void;
}

export default function UnfollowButton({ authorId, onUnfollow }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleUnfollow() {
    setLoading(true);
    const res = await fetch(`/api/authors/${authorId}/follow`, { method: "DELETE" });
    if (res.ok) {
      onUnfollow?.();
    } else {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={() => void handleUnfollow()}
      disabled={loading}
      style={{
        fontSize: "12px", border: "1px solid #dde3ed", borderRadius: "6px",
        padding: "5px 12px", color: "#5a6a85", background: "none", cursor: "pointer",
      }}
    >
      {loading ? "…" : "Unfollow"}
    </button>
  );
}
