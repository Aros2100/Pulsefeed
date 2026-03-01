"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthorSearch, { type AuthorMeta } from "@/components/AuthorSearch";

type RoleType = "clinician" | "researcher" | "both";

const ROLES: { value: RoleType; icon: string; label: string; desc: string }[] = [
  { value: "clinician",  icon: "🩺", label: "Clinician",  desc: "I treat patients and need clinically actionable evidence" },
  { value: "researcher", icon: "🔬", label: "Researcher", desc: "I conduct research and need methodological depth" },
  { value: "both",       icon: "⚕️", label: "Both",       desc: "I do both clinical work and research" },
];

function Spinner() {
  return (
    <svg style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

interface SelectedAuthor {
  id: string;
  meta: AuthorMeta;
}

interface Props {
  initialAuthorQuery?: string;
}

export default function OnboardingFlow({ initialAuthorQuery = "" }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: author identity
  const [selectedAuthor, setSelectedAuthor] = useState<SelectedAuthor | null>(null);

  // Step 2: role type
  const [roleType, setRoleType] = useState<RoleType | null>(null);

  // Submission
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleAuthorSelect(authorId: string, meta: AuthorMeta) {
    setSelectedAuthor({ id: authorId, meta });
  }

  function handleAuthorSkip() {
    setSelectedAuthor(null);
    setStep(2);
  }

  function confirmAuthor() {
    setStep(2);
  }

  async function handleSubmit() {
    if (!roleType) return;

    setLoading(true);
    setServerError(null);

    try {
      const res = await fetch("/api/users/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_type: roleType,
          author_id: selectedAuthor?.id ?? null,
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setServerError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.replace("/");
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const TOTAL = 2;
  const progress = Math.round((step / TOTAL) * 100);

  const headings = [
    "Are you a published author?",
    "What best describes you?",
  ];
  const subcopy = [
    "Link your profile so your publications appear on your dashboard.",
    "We'll use this to personalise the depth and focus of your recommendations.",
  ];

  const btnPrimary: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    height: "44px",
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: "7px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };

  const btnSecondary: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "44px",
    padding: "0 20px",
    background: "#fff",
    color: "#1a1a1a",
    border: "1px solid #1a1a1a",
    borderRadius: "7px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Card header with progress */}
      <div
        style={{
          background: "#EEF2F7",
          borderBottom: "1px solid #e2e6ea",
          padding: "14px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
            Step {step} of {TOTAL}
          </p>
          <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>{progress}%</p>
        </div>
        <div style={{ height: "3px", width: "100%", background: "#d1d5db", borderRadius: "99px" }}>
          <div
            style={{
              height: "3px",
              borderRadius: "99px",
              background: "#E83B2A",
              width: `${progress}%`,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "28px 24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>
          {headings[step - 1]}
        </h1>
        <p style={{ fontSize: "14px", color: "#888", margin: "0 0 24px" }}>
          {subcopy[step - 1]}
        </p>

        {/* ── Step 1: Author identity ── */}
        {step === 1 && (
          <div>
            {selectedAuthor ? (
              <div>
                <div
                  style={{
                    border: "1.5px solid #E83B2A",
                    borderRadius: "10px",
                    padding: "16px 18px",
                    background: "#fff8f7",
                    marginBottom: "20px",
                  }}
                >
                  <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#E83B2A", margin: "0 0 6px" }}>
                    We found your profile
                  </p>
                  <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>
                    {selectedAuthor.meta.name}
                  </p>
                  {[selectedAuthor.meta.hospital, selectedAuthor.meta.city, selectedAuthor.meta.country].some(Boolean) && (
                    <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>
                      {[selectedAuthor.meta.hospital, selectedAuthor.meta.city, selectedAuthor.meta.country].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                <button type="button" onClick={confirmAuthor} style={btnPrimary}>
                  Continue
                </button>

                <div style={{ textAlign: "center", marginTop: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedAuthor(null)}
                    style={{ background: "none", border: "none", padding: 0, fontSize: "13px", color: "#888", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
                  >
                    That&apos;s not me — search again
                  </button>
                </div>
              </div>
            ) : (
              <AuthorSearch
                initialQuery={initialAuthorQuery}
                onSelect={handleAuthorSelect}
                onSkip={handleAuthorSkip}
                skipLabel="Skip — I'm not a published author"
              />
            )}
          </div>
        )}

        {/* ── Step 2: Role type ── */}
        {step === 2 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "24px" }}>
              {ROLES.map((role) => {
                const selected = roleType === role.value;
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setRoleType(role.value)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "8px",
                      borderRadius: "8px",
                      border: selected ? "1.5px solid #E83B2A" : "1px solid #e2e6ea",
                      padding: "16px 10px",
                      cursor: "pointer",
                      background: selected ? "#fff8f7" : "#fff",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "24px", lineHeight: 1 }}>{role.icon}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: selected ? "#E83B2A" : "#1a1a1a" }}>
                      {role.label}
                    </span>
                    <span style={{ fontSize: "11px", color: "#888", lineHeight: 1.4 }}>
                      {role.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {serverError && (
              <div
                style={{
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                }}
              >
                <p style={{ fontSize: "13px", color: "#b91c1c", margin: 0 }}>{serverError}</p>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={() => setStep(1)} disabled={loading} style={{ ...btnSecondary, opacity: loading ? 0.4 : 1 }}>
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!roleType || loading}
                style={{
                  ...btnPrimary,
                  flex: 1,
                  width: "auto",
                  opacity: !roleType || loading ? 0.4 : 1,
                  cursor: !roleType || loading ? "not-allowed" : "pointer",
                }}
              >
                {loading && <Spinner />}
                {loading ? "Saving…" : "Finish setup"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
