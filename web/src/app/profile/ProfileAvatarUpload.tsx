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
    <div style={{ position: "relative", flexShrink: 0, width: "72px", height: "72px" }}>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: "72px", height: "72px", borderRadius: "50%", overflow: "hidden",
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-secondary)" }}>
            {initials(displayName || "?")}
          </span>
        )}
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title={uploading ? "Uploading…" : "Change photo"}
        style={{
          position: "absolute", bottom: "0", right: "0",
          width: "22px", height: "22px", borderRadius: "50%",
          background: uploading ? "var(--color-background-secondary)" : "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-tertiary)",
          cursor: uploading ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", padding: 0,
        }}
        aria-label="Change photo"
      >
        {uploading ? "…" : "✎"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
