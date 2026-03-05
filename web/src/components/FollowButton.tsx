"use client";

import { useState } from "react";

interface Props {
  authorId:        string;
  initialFollowing: boolean;
}

export default function FollowButton({ authorId, initialFollowing }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading,   setLoading]   = useState(false);

  async function toggle() {
    setLoading(true);
    const method = following ? "DELETE" : "POST";
    const res    = await fetch(`/api/authors/${authorId}/follow`, { method });
    if (res.ok) setFollowing(!following);
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        fontSize: "13px", fontWeight: 600, padding: "7px 18px", borderRadius: "8px",
        border:     following ? "1px solid #bbf7d0" : "1px solid #dde3ed",
        background: following ? "#f0fdf4"           : "#fff",
        color:      following ? "#15803d"           : "#5a6a85",
        cursor:     loading ? "wait" : "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {following ? "Following ✓" : "Follow"}
    </button>
  );
}
