"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/system/tagging", label: "Single terms" },
  { href: "/admin/system/tagging/combos", label: "Combo terms" },
];

export default function TaggingNav() {
  const pathname = usePathname();

  return (
    <div style={{ marginBottom: "28px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 16px" }}>
        Auto-Tagging
      </h1>
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #e5e7eb" }}>
        {tabs.map((t) => {
          const isActive =
            t.href === "/admin/system/tagging"
              ? pathname === t.href
              : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                fontSize: "14px",
                fontWeight: isActive ? 600 : 400,
                padding: "8px 20px",
                color: isActive ? "#0891b2" : "#64748b",
                borderBottom: isActive ? "2px solid #0891b2" : "2px solid transparent",
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
