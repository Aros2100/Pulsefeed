"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

type FieldErrors = Partial<
  Record<"firstName" | "lastName" | "email" | "password", string>
>;

function Spinner() {
  return (
    <svg style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setServerError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await res.json()) as {
        ok: boolean;
        email?: string;
        error?: string;
        field?: string;
      };

      if (!data.ok) {
        const field = data.field as keyof FieldErrors | undefined;
        if (field) {
          setFieldErrors({ [field]: data.error });
        } else {
          setServerError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      router.push(
        `/verify-email?email=${encodeURIComponent(data.email ?? form.email)}`
      );
    } catch {
      setServerError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const isValid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.password.length >= 8;

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    boxSizing: "border-box",
    border: hasError ? "1px solid #E83B2A" : "1px solid #d1d5db",
    borderRadius: "7px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "#1a1a1a",
    outline: "none",
    background: "#fff",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fa",
        display: "flex",
        justifyContent: "center",
        paddingTop: "60px",
        paddingBottom: "60px",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "480px" }}>
        {/* Logo */}
        <div style={{ marginBottom: "28px", textAlign: "center" }}>
          <Image
            src="/logo.png"
            alt="PulseFeed"
            width={160}
            height={40}
            style={{ margin: "0 auto", height: "40px", width: "auto" }}
            priority
          />
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Medical literature, curated by AI
          </p>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Card header */}
          <div
            style={{
              background: "#EEF2F7",
              borderBottom: "1px solid #e2e6ea",
              padding: "14px 24px",
            }}
          >
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Create your account
            </h2>
          </div>

          {/* Card body */}
          <div style={{ padding: "24px" }}>
            {/* Specialty badge */}
            <div style={{ marginBottom: "20px" }}>
              <p style={{ fontSize: "12px", color: "#888", margin: "0 0 8px" }}>
                You are signing up for
              </p>
              <span
                style={{
                  display: "inline-block",
                  background: "#E83B2A",
                  color: "#fff",
                  borderRadius: "99px",
                  padding: "4px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span style={{ textTransform: "capitalize" }}>{ACTIVE_SPECIALTY}</span>
              </span>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {/* First name + Last name */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label
                    htmlFor="firstName"
                    style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#1a1a1a", marginBottom: "5px" }}
                  >
                    First name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={form.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                    placeholder="Jane"
                    style={inputStyle(!!fieldErrors.firstName)}
                  />
                  {fieldErrors.firstName && (
                    <p style={{ marginTop: "5px", fontSize: "12px", color: "#E83B2A" }}>
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="lastName"
                    style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#1a1a1a", marginBottom: "5px" }}
                  >
                    Last name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={form.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                    placeholder="Smith"
                    style={inputStyle(!!fieldErrors.lastName)}
                  />
                  {fieldErrors.lastName && (
                    <p style={{ marginTop: "5px", fontSize: "12px", color: "#E83B2A" }}>
                      {fieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="email"
                  style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#1a1a1a", marginBottom: "5px" }}
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle(!!fieldErrors.email)}
                />
                {fieldErrors.email && (
                  <p style={{ marginTop: "5px", fontSize: "12px", color: "#E83B2A" }}>
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div style={{ marginBottom: "24px" }}>
                <label
                  htmlFor="password"
                  style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#1a1a1a", marginBottom: "5px" }}
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  style={inputStyle(!!fieldErrors.password)}
                />
                {fieldErrors.password ? (
                  <p style={{ marginTop: "5px", fontSize: "12px", color: "#E83B2A" }}>
                    {fieldErrors.password}
                  </p>
                ) : (
                  <p style={{ marginTop: "5px", fontSize: "12px", color: "#888" }}>
                    At least 8 characters
                  </p>
                )}
              </div>

              {/* Server error */}
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

              <button
                type="submit"
                disabled={loading || !isValid}
                style={{
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
                  cursor: loading || !isValid ? "not-allowed" : "pointer",
                  opacity: loading || !isValid ? 0.5 : 1,
                }}
              >
                {loading && <Spinner />}
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>
          </div>
        </div>

        <p style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "#888" }}>
          Already have an account?{" "}
          <Link
            href="/login"
            style={{ color: "#E83B2A", fontWeight: 600, textDecoration: "none" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
