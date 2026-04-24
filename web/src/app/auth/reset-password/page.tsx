"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-indigo-600"
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
  );
}

function InvalidTokenState() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <svg
          className="h-8 w-8 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">
        Invalid or expired link
      </h2>
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
        This password reset link has expired or has already been used. Links
        are valid for 1 hour.
      </p>
      <Link
        href="/forgot-password"
        className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Request a new link
      </Link>
    </div>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const [tokenStatus, setTokenStatus] = useState<
    "verifying" | "valid" | "invalid"
  >("verifying");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"password" | "confirmPassword", string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!tokenHash || type !== "recovery") {
      setTokenStatus("invalid");
      return;
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ error }) => {
        setTokenStatus(error ? "invalid" : "valid");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);

    const errors: Partial<Record<"password" | "confirmPassword", string>> = {};
    if (password.length < 8)
      errors.password = "Password must be at least 8 characters";
    if (password !== confirmPassword)
      errors.confirmPassword = "Passwords do not match";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        field?: string;
      };

      if (!data.ok) {
        if (data.field === "password" || data.field === "confirmPassword") {
          setFieldErrors({ [data.field]: data.error });
        } else {
          setServerError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => router.replace("/login"), 3000);
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (tokenStatus === "verifying") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-slate-500">Verifying link…</p>
      </div>
    );
  }

  if (tokenStatus === "invalid") {
    return <InvalidTokenState />;
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg
            className="h-8 w-8 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Password updated
        </h2>
        <p className="text-sm text-slate-500">
          Redirecting you to sign in…
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">
        Set a new password
      </h1>

      <form onSubmit={handleSubmit} noValidate>
        {/* New password */}
        <div className="mb-4">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
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

        {/* Confirm password */}
        <div className="mb-6">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setFieldErrors((prev) => ({
                ...prev,
                confirmPassword: undefined,
              }));
            }}
            aria-describedby={
              fieldErrors.confirmPassword ? "confirm-error" : undefined
            }
            aria-invalid={!!fieldErrors.confirmPassword}
            className={[
              "w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900",
              "placeholder-slate-400 focus:outline-none focus:ring-2 transition",
              fieldErrors.confirmPassword
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20",
            ].join(" ")}
          />
          {fieldErrors.confirmPassword && (
            <p id="confirm-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        {serverError && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password || !confirmPassword}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Spinner />}
          {loading ? "Saving…" : "Save new password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image
            src="/pulsefeeds-stacked-onwhite-slate.svg"
            alt="PulseFeed"
            width={194}
            height={48}
            className="mx-auto h-10 w-auto"
            priority
          />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Suspense
            fallback={
              <div className="flex flex-col items-center gap-3 py-4">
                <Spinner />
                <p className="text-sm text-slate-500">Loading…</p>
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
