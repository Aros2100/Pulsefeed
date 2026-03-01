"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);
    setServerError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        field?: string;
      };

      if (!data.ok) {
        if (data.field === "email") {
          setFieldError(data.error ?? "Invalid email address");
        } else {
          setServerError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      setSuccess(true);
    } catch {
      setServerError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center">
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
            Check your email
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            If{" "}
            <span className="font-semibold text-slate-700">{email}</span> is
            registered with us, we&apos;ve sent a link to reset your password.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            The link expires in 1 hour. Also check your spam folder.
          </p>
          <button
            onClick={() => {
              setSuccess(false);
              setEmail("");
            }}
            className="mt-6 text-sm text-indigo-600 hover:text-indigo-500 font-medium transition-colors"
          >
            Try a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="PulseFeed"
            width={160}
            height={40}
            className="mx-auto mb-6 h-10 w-auto"
            priority
          />
          <h1 className="text-2xl font-bold text-slate-900">
            Forgot your password?
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-5">
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
                  setFieldError(null);
                }}
                placeholder="you@example.com"
                aria-describedby={fieldError ? "email-error" : undefined}
                aria-invalid={!!fieldError}
                className={[
                  "w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900",
                  "placeholder-slate-400 focus:outline-none focus:ring-2 transition",
                  fieldError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20",
                ].join(" ")}
              />
              {fieldError && (
                <p id="email-error" className="mt-1.5 text-xs text-red-600">
                  {fieldError}
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
              disabled={loading || !email.trim()}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
