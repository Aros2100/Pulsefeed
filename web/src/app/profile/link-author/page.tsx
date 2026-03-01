import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LinkAuthorClient from "./LinkAuthorClient";

export default async function LinkAuthorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div
      style={{
        fontFamily: "var(--font-inter), Inter, sans-serif",
        background: "#f5f7fa",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
          padding: "40px",
          width: "100%",
          maxWidth: "480px",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6366f1",
            marginBottom: "8px",
          }}
        >
          Author identity
        </p>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#1a1a1a",
            marginBottom: "8px",
          }}
        >
          Link your author profile
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#64748b",
            marginBottom: "32px",
            lineHeight: 1.5,
          }}
        >
          Find your name in our author database so your publications appear on
          your dashboard.
        </p>

        <LinkAuthorClient />
      </div>
    </div>
  );
}
