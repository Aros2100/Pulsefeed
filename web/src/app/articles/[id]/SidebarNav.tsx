"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface NavItem {
  id: string;
  label: string;
  badge?: number;
  ai?: boolean;
}

interface Props {
  items: NavItem[];
}

export default function SidebarNav({ items }: Props) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const handleScroll = () => {
      let current = "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && window.scrollY >= el.offsetTop - 120) {
          current = item.id;
        }
      }
      if (current) setActiveId(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [items]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside style={{ position: "sticky", top: "88px", height: "fit-content", padding: "32px 0" }}>
      <Link href="/articles" style={{ fontSize: "13px", color: "#888", textDecoration: "none", display: "block", marginBottom: "28px" }}>
        ← All articles
      </Link>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => {
          const isActive = activeId === item.id;
          const isAi = item.ai;
          return (
            <li key={item.id} style={{ marginBottom: "2px" }}>
              <button
                onClick={() => scrollTo(item.id)}
                style={{
                  fontSize: "13px",
                  color: isActive
                    ? (isAi ? "#3a7d44" : "#E83B2A")
                    : (isAi ? "#3a7d44" : "#888"),
                  textDecoration: "none",
                  padding: "7px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: "6px",
                  borderLeft: `2px solid ${isActive ? (isAi ? "#3a7d44" : "#E83B2A") : "transparent"}`,
                  background: isActive ? (isAi ? "#f0f7ee" : "#fff5f4") : "none",
                  fontWeight: isActive ? 500 : 400,
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  outline: "none",
                  transition: "all 0.15s",
                }}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span style={{
                    fontSize: "11px",
                    background: isActive ? (isAi ? "#c8e6c0" : "#fde8e6") : "#eef2f7",
                    color: isActive ? (isAi ? "#2d7a2d" : "#E83B2A") : "#888",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    fontWeight: 500,
                  }}>
                    {item.badge}
                  </span>
                )}
                {item.ai && !item.badge && (
                  <span style={{
                    fontSize: "10px",
                    background: "#e8f4e8",
                    color: "#3a7d44",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    fontWeight: 600,
                  }}>
                    AI
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
