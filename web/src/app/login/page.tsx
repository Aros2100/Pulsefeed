"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

// Only allow relative paths to prevent open redirect
function safeRedirectTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const redirectTo = safeRedirectTo(searchParams.get("redirectTo"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"email" | "password", string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        field?: string;
      };

      if (!data.ok) {
        if (data.field === "email" || data.field === "password") {
          setFieldErrors({ [data.field]: data.error });
        } else {
          setServerError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      router.replace(redirectTo);
    } catch {
      setServerError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Email */}
      <div className="mb-4">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((p) => ({ ...p, email: undefined }));
          }}
          placeholder="you@example.com"
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          aria-invalid={!!fieldErrors.email}
          className={[
            "w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900",
            "placeholder-slate-400 focus:outline-none focus:ring-2 transition",
            fieldErrors.email
              ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
              : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20",
          ].join(" ")}
        />
        {fieldErrors.email && (
          <p id="email-error" className="mt-1.5 text-xs text-red-600">
            {fieldErrors.email}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <Link
            href="/forgot-password"
            tabIndex={-1}
            className="text-xs text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((p) => ({ ...p, password: undefined }));
            setServerError(null);
          }}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          aria-invalid={!!fieldErrors.password}
          className={[
            "w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900",
            "placeholder-slate-400 focus:outline-none focus:ring-2 transition",
            fieldErrors.password
              ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
              : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20",
          ].join(" ")}
        />
        {fieldErrors.password && (
          <p id="password-error" className="mt-1.5 text-xs text-red-600">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {/* Server error (wrong email/password) */}
      {serverError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim() || !password}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <Image
            src="/pulsefeeds-stacked-onwhite-slate.svg"
            alt="PulseFeed"
            width={194}
            height={48}
            className="mx-auto mb-3 h-10 w-auto"
            priority
          />
          <p className="text-sm text-slate-500">
            Medical literature, curated by AI
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Sign in</h2>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Trouble signing in?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Reset your password
          </Link>
        </p>
      </div>
    </div>
  );
}
