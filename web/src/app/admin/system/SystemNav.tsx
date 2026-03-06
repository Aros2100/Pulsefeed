"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Import", href: "/admin/system/import" },
  { label: "Cost",   href: "/admin/system/cost" },
];

export default function SystemNav() {
  const pathname = usePathname();

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #dde3ed" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "0 24px", display: "flex" }}>
        {tabs.map(({ label, href }) => {
          const isActive =
            pathname === href ||
            pathname.startsWith(href + "/") ||
            (href === "/admin/system/import" && pathname === "/admin/system");
          return (
            <Link
              key={label}
              href={href}
              style={{
                fontSize: "13px",
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#1a1a1a" : "#5a6a85",
                textDecoration: "none",
                padding: "12px 16px",
                borderBottom: isActive ? "2px solid #E83B2A" : "2px solid transparent",
                marginBottom: "-1px",
                display: "inline-block",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
