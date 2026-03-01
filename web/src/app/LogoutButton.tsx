"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
