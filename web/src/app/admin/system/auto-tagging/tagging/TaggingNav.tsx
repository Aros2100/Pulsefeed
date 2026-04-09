"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/system/auto-tagging/tagging", label: "Single terms" },
  { href: "/admin/system/auto-tagging/tagging/combos", label: "Combo terms" },
];

export default function TaggingNav() {
  const pathname = usePathname();

  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{
        fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
        textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
      }}>
        System · Auto-Tagging
      </div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 16px" }}>
        Auto-Tagging
      </h1>
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #e5e7eb" }}>
        {tabs.map((t) => {
          const isActive =
            t.href === "/admin/system/auto-tagging/tagging"
              ? pathname === t.href
              : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                fontSize: "14px",
                fontWeight: isActive ? 700 : 400,
                padding: "8px 20px",
                color: isActive ? "#1a1a1a" : "#5a6a85",
                borderBottom: isActive ? "2px solid #1a1a1a" : "2px solid transparent",
                marginBottom: "-2px",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
