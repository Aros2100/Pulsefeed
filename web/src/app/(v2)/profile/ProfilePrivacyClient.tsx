"use client";

import { useState } from "react";
import { Toggle } from "./ProfileEditClient";

interface Props {
  initialIsPublic:           boolean;
  initialEmailNotifications: boolean;
  name:                      string;
  specialtySlugs:            string[];
  articleCount:              number;
  specialtyLabels:           Record<string, string>;
}

export default function ProfilePrivacyClient({
  initialIsPublic,
  initialEmailNotifications,
  name,
  specialtySlugs,
  articleCount,
  specialtyLabels,
}: Props) {
  const [isPublic,            setIsPublic]            = useState(initialIsPublic);
  const [emailNotifications,  setEmailNotifications]  = useState(initialEmailNotifications);

  async function patch(body: Record<string, unknown>) {
    await fetch("/api/profile", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
  }

  function handlePublicToggle(v: boolean) {
    setIsPublic(v);
    void patch({ is_public: v });
  }

  function handleEmailToggle(v: boolean) {
    setEmailNotifications(v);
    void patch({ email_notifications: v });
  }

  const rowStyle: React.CSSProperties = {
    padding: "16px 24px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  };

  return (
    <>
      {/* Public profile row */}
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>Public profile</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            {isPublic
              ? "Your name, specialty and publications are visible to other users"
              : "Your profile is private"}
          </div>
        </div>
        <Toggle checked={isPublic} onChange={handlePublicToggle} />
      </div>

      {isPublic && (
        <div style={{ margin: "0 24px 16px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px 16px", background: "var(--color-background-secondary)" }}>
          <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
            What others can see:
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "6px" }}>{name}</div>
          {specialtySlugs.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
              {specialtySlugs.map((slug) => (
                <span key={slug} style={{ background: "#EEEDFE", color: "#3C3489", border: "1px solid #AFA9EC", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 600 }}>
                  {specialtyLabels[slug] ?? slug}
                </span>
              ))}
            </div>
          )}
          {articleCount > 0 && (
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{articleCount} publication{articleCount !== 1 ? "s" : ""}</div>
          )}
        </div>
      )}

      {/* Notifications row */}
      <div style={{ ...rowStyle, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>Receive email notifications</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>Get notified about new articles and author publications</div>
        </div>
        <Toggle checked={emailNotifications} onChange={handleEmailToggle} />
      </div>
    </>
  );
}
