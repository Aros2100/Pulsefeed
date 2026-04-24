"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import NotificationBell from "@/components/NotificationBell";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const isAdminMode = pathname.startsWith("/admin");
  const isAdmin = user?.app_metadata?.role === "admin";
  const firstName =
    (user?.user_metadata?.name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0];

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header style={{
      height: "72px",
      background: "#EEF2F7",
      borderBottom: "1px solid #dde3ed",
      display: "flex",
      alignItems: "center",
      padding: "0 40px",
      position: "sticky",
      top: 0,
      zIndex: 100,
      flexShrink: 0,
    }}>
      <Link href={isAdminMode ? "/admin" : "/"} style={{ textDecoration: "none", color: "inherit" }}>
        <img src="/pulsefeeds-stacked-onwhite-slate.svg" alt="PulseFeed" style={{ height: "41px", display: "block" }} />
      </Link>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "16px" }}>
        {isAdmin && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={() => router.push("/")}
              style={{
                fontSize: "12px", fontWeight: 600,
                background: !isAdminMode ? "#fff" : "none",
                border: "1px solid #dde3ed",
                borderRadius: "20px",
                padding: "4px 12px",
                color: !isAdminMode ? "#1a1a1a" : "#5a6a85",
                cursor: "pointer",
              }}
            >
              User
            </button>
            <button
              onClick={() => router.push("/admin")}
              style={{
                fontSize: "12px", fontWeight: 600,
                background: isAdminMode ? "#fff" : "none",
                border: "1px solid #dde3ed",
                borderRadius: "20px",
                padding: "4px 12px",
                color: isAdminMode ? "#1a1a1a" : "#5a6a85",
                cursor: "pointer",
              }}
            >
              Admin
            </button>
          </div>
        )}
        <NotificationBell />
        {firstName && (
          <a href="/profile" style={{ fontSize: "14px", color: "#5a6a85", textDecoration: "none" }}>{firstName}</a>
        )}
        <button
          onClick={handleLogout}
          style={{
            fontSize: "13px",
            color: "#888",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            padding: 0,
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
