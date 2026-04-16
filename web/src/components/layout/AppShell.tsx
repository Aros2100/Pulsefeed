"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import UserHeader from "./UserHeader";
import type { AppVersion } from "@/lib/version";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [version, setVersion] = useState<AppVersion>(() => {
    if (typeof document === "undefined") return "v1";
    const v = document.cookie.match(/pf-version=([^;]+)/)?.[1];
    return v === "v2" ? "v2" : "v1";
  });
  const previewActive = typeof document !== "undefined" && document.cookie.includes("pf-version=");
  const pathname = usePathname();
  const router = useRouter();
  const mode: "user" | "admin" = pathname.startsWith("/admin") ? "admin" : "user";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  async function toggleVersion() {
    const next: AppVersion = version === "v1" ? "v2" : "v1";
    await fetch("/api/set-version", {
      method: "POST",
      body: JSON.stringify({ version: next }),
      headers: { "Content-Type": "application/json" },
    });
    setVersion(next);
    window.location.reload();
  }

  const name = (user?.user_metadata?.name as string | undefined) ?? user?.email?.split("@")[0] ?? "User";
  const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const activePage: "articles" | "authors" = pathname.startsWith("/authors") ? "authors" : "articles";
  const isAdmin = pathname.startsWith("/admin");
  const isAdminUser = user?.app_metadata?.role === "admin";

  const previewBanner = isAdminUser && previewActive ? (
    <div style={{
      background: version === "v2" ? "#fee2e2" : "#fef3c7",
      borderBottom: `1px solid ${version === "v2" ? "#f87171" : "#f59e0b"}`,
      padding: "6px 16px",
      fontSize: "12px",
      fontWeight: 600,
      color: version === "v2" ? "#991b1b" : "#92400e",
      textAlign: "center",
      letterSpacing: "0.03em",
    }}>
      DEV PREVIEW — {version.toUpperCase()}
    </div>
  ) : null;

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <UserHeader
        activePage={activePage}
        mode={mode}
        onModeChange={() => {}}
        user={{ name, initials }}
        onProfileClick={() => router.push("/profile")}
        version={version}
        versionPill={isAdminUser ? (
          <button
            onClick={toggleVersion}
            style={{
              fontSize: "11px",
              fontWeight: 600,
              background: version === "v2" ? "#E83B2A" : "#e5e7eb",
              color: version === "v2" ? "#fff" : "#555",
              border: "none",
              borderRadius: "4px",
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            Preview: {version.toUpperCase()}
          </button>
        ) : undefined}
      />
      {previewBanner}
      <main className="bg-pf-bg min-h-screen">
        {children}
      </main>
    </>
  );
}
