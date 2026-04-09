"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface VerificationStats {
  human:        number;
  uverificeret: number;
}

function fmt(n: number | undefined): string {
  if (n === undefined) return "–";
  return n.toLocaleString("da-DK");
}

export default function DatarensPage() {
  const [stats, setStats]       = useState<VerificationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_author_verification_stats")
      .single()
      .then(({ data }: { data: VerificationStats | null }) => {
        if (data) setStats(data);
      })
      .finally(() => setStatsLoading(false));
  }, []);

  const statLabel = statsLoading
    ? "–"
    : `${fmt(stats?.human)} human · ${fmt(stats?.uverificeret)} uverificeret`;

  const items = [
    {
      href:  "/admin/system/datarens/author-geo",
      title: "Author Verification",
      desc:  "Verificér forfatter-lokationer fra affiliation-parsing",
      stats: statLabel,
    },
    {
      href:  "/admin/system/datarens/dedub",
      title: "Dedub",
      desc:  "Deduplicering af forfatterposter",
      stats: null,
    },
  ];

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase" as const,
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            Datarens
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Moduler</h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Geo-validering og deduplicering af forfattere
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                padding: "24px 28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "box-shadow 0.15s, border-color 0.15s",
                cursor: "pointer",
              }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px" }}>{item.title}</div>
                  <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{item.desc}</p>
                  {item.stats !== null && (
                    <p style={{ fontSize: "12px", color: "#aaa", margin: "6px 0 0", fontVariantNumeric: "tabular-nums" }}>
                      {item.stats}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: "18px", color: "#bbb", flexShrink: 0 }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
