"use client";

import { useState, useRef } from "react";

interface Props {
  avatarUrl:   string | null;
  displayName: string;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function ProfileAvatarUpload({ avatarUrl: initial, displayName }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initial);
  const [uploading,  setUploading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("avatar", file);
    const res  = await fetch("/api/profile/avatar", { method: "POST", body: form });
    const data = await res.json() as { ok: boolean; avatar_url?: string };
    if (data.ok && data.avatar_url) setAvatarUrl(data.avatar_url);
    setUploading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: "80px", height: "80px", borderRadius: "50%", overflow: "hidden",
          background: "#EEF2F7", border: "2px solid #dde3ed", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: "24px", fontWeight: 700, color: "#5a6a85" }}>{initials(displayName || "?")}</span>
        )}
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "none", cursor: uploading ? "wait" : "pointer", textDecoration: "underline", padding: 0 }}
      >
        {uploading ? "Uploading…" : "Change photo"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
