"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { SPECIALTIES } from "@/lib/auth/specialties";

interface SpecialtyStat {
  slug: string;
  label: string;
  circle1Count: number;
  circle2Unverified: number;
  lastImportAt: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTIVE_SPECIALTIES = SPECIALTIES.filter((s) => s.active);

export default function ImportPage() {
  const [stats, setStats] = useState<SpecialtyStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/admin/system/specialty-stats")
      .then((r) => r.json())
      .then((d: { ok: boolean; specialties?: SpecialtyStat[] }) => {
        if (d.ok) setStats(d.specialties ?? []);
        setLoading(false);
      });
  }, []);

  function getStat(slug: string): SpecialtyStat | undefined {
    return stats.find((s) => s.slug === slug);
  }

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <Header />
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>
        <div style={{ marginBottom: "28px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            System · Import
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Import</h1>
          <p style={{ fontSize: "13px", color: "#888" }}>
            Configure Circle 1 and Circle 2 import sources per specialty
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
          {ACTIVE_SPECIALTIES.map((spec) => {
            const stat = getStat(spec.slug);
            return (
              <div key={spec.slug} style={{
                background: "#fff",
                borderRadius: "10px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
                overflow: "hidden",
              }}>
                <div style={{
                  background: "#EEF2F7",
                  borderBottom: "1px solid #dde3ed",
                  padding: "10px 24px",
                }}>
                  <span style={{
                    fontSize: "11px",
                    letterSpacing: "0.08em",
                    color: "#E83B2A",
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}>
                    {spec.label}
                  </span>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", color: "#5a6a85" }}>Circle 1</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
                        {loading ? "—" : `${stat?.circle1Count ?? 0} articles`}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", color: "#5a6a85" }}>Circle 2</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
                        {loading ? "—" : `${stat?.circle2Unverified ?? 0} unverified`}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", color: "#5a6a85" }}>Last import</span>
                      <span style={{ fontSize: "13px", color: "#888" }}>
                        {loading ? "—" : fmt(stat?.lastImportAt ?? null)}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/admin/system/layers/${spec.slug}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#E83B2A",
                      textDecoration: "none",
                    }}
                  >
                    Manage →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tools */}
        <div style={{ marginTop: "32px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#5a6a85",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: "12px",
          }}>
            Værktøjer
          </div>
          <div style={{
            background: "#fff",
            borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "2px" }}>
                Forfatter-import
              </div>
              <div style={{ fontSize: "13px", color: "#888" }}>
                Kobler forfatter-JSONB til article_authors for artikler der mangler det
              </div>
            </div>
            <Link
              href="/admin/system/author-linking"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#E83B2A",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Åbn →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
