"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import UserHeader from "./UserHeader";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const mode: "user" | "admin" = pathname.startsWith("/admin") ? "admin" : "user";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const name = (user?.user_metadata?.name as string | undefined) ?? user?.email?.split("@")[0] ?? "User";
  const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const activePage: "articles" | "authors" = pathname.startsWith("/authors") ? "authors" : "articles";
  const isAdmin = pathname.startsWith("/admin");

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
      />
      <main className="bg-pf-bg min-h-screen">
        {children}
      </main>
    </>
  );
}
