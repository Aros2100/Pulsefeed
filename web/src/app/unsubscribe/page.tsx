"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

const UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 minutes — must match the API

type PageState =
  | "loading"
  | "invalid"
  | "expired"
  | "confirm"
  | "success"
  | "undone";

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
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

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [unsubscribedAt, setUnsubscribedAt] = useState<number | null>(null);
  const [showUndo, setShowUndo] = useState(false);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setPageState("invalid");
      return;
    }

    fetch(`/api/subscribers/unsubscribe/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(
        (data: {
          ok: boolean;
          email?: string;
          firstName?: string;
          expired?: boolean;
        }) => {
          if (!data.ok) {
            setPageState(data.expired ? "expired" : "invalid");
          } else {
            setEmail(data.email ?? "");
            setFirstName(data.firstName ?? "");
            setPageState("confirm");
          }
        }
      )
      .catch(() => setPageState("invalid"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hide Undo button after the 10-minute window
  useEffect(() => {
    if (pageState !== "success" || unsubscribedAt === null) return;
    const remaining = UNDO_WINDOW_MS - (Date.now() - unsubscribedAt);
    if (remaining <= 0) {
      setShowUndo(false);
      return;
    }
    const timer = setTimeout(() => setShowUndo(false), remaining);
    return () => clearTimeout(timer);
  }, [pageState, unsubscribedAt]);

  async function handleUnsubscribe() {
    setLoading(true);
    setServerError(null);
    try {
      const res = await fetch("/api/subscribers/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        expired?: boolean;
      };

      if (data.ok) {
        const now = Date.now();
        setUnsubscribedAt(now);
        setShowUndo(true);
        setPageState("success");
      } else {
        setServerError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo() {
    setLoading(true);
    setServerError(null);
    try {
      const res = await fetch("/api/subscribers/resubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        windowExpired?: boolean;
      };

      if (data.ok) {
        setPageState("undone");
      } else if (data.windowExpired) {
        setShowUndo(false);
        setServerError(
          "The undo window has expired. Please contact support if you changed your mind."
        );
      } else {
        setServerError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-indigo-600">
        <Spinner className="h-5 w-5" />
        <p className="text-sm text-slate-500">Verifying link…</p>
      </div>
    );
  }

  // ── Expired ──────────────────────────────────────────────────────────────
  if (pageState === "expired") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <svg
            className="h-7 w-7 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Link expired</h2>
        <p className="text-sm text-slate-500">
          This unsubscribe link has expired (links are valid for 30 days).
          Please contact us if you need help.
        </p>
      </div>
    );
  }

  // ── Invalid ──────────────────────────────────────────────────────────────
  if (pageState === "invalid") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <svg
            className="h-7 w-7 text-red-500"
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
        <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid link</h2>
        <p className="text-sm text-slate-500">
          This unsubscribe link is invalid or has already been used.
        </p>
      </div>
    );
  }

  // ── Undone ───────────────────────────────────────────────────────────────
  if (pageState === "undone") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <svg
            className="h-7 w-7 text-emerald-600"
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
          You&apos;re back!
        </h2>
        <p className="text-sm text-slate-500">
          <span className="font-medium text-slate-700">{email}</span> has been
          re-subscribed. You&apos;ll continue receiving your digest as normal.
        </p>
      </div>
    );
  }

  // ── Success (unsubscribed) ────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <svg
            className="h-7 w-7 text-slate-500"
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
          You&apos;ve been unsubscribed
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          <span className="font-medium text-slate-700">{email}</span> will no
          longer receive emails from PulseFeed.
        </p>

        {serverError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        {showUndo && (
          <button
            onClick={handleUndo}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading && <Spinner />}
            {loading ? "Undoing…" : "Undo — re-subscribe me"}
          </button>
        )}
      </div>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
          <svg
            className="h-7 w-7 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        {firstName && (
          <p className="text-sm text-slate-500 mb-1">Hi {firstName},</p>
        )}
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Unsubscribe from PulseFeed?
        </h2>
        <p className="text-sm text-slate-500">
          Are you sure you want to unsubscribe{" "}
          <span className="font-medium text-slate-700">{email}</span>? You
          won&apos;t receive any more digest emails.
        </p>
      </div>

      {serverError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={handleUnsubscribe}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <Spinner />}
          {loading ? "Unsubscribing…" : "Yes, unsubscribe me"}
        </button>
        <p className="text-center text-xs text-slate-400">
          Changed your mind?{" "}
          <Link
            href="/"
            className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Go back
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="PulseFeed"
            width={160}
            height={40}
            className="mx-auto h-10 w-auto"
            priority
          />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Suspense
            fallback={
              <div className="flex flex-col items-center gap-3 py-6 text-indigo-600">
                <Spinner className="h-5 w-5" />
                <p className="text-sm text-slate-500">Loading…</p>
              </div>
            }
          >
            <UnsubscribeContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
