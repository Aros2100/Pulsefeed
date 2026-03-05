"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Notification {
  id:         string;
  type:       string;
  title:      string;
  message:    string | null;
  link:       string | null;
  read:       boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open,  setOpen]  = useState(false);
  const ref    = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d: { ok: boolean; notifications?: Notification[] }) => {
        if (d.ok) setNotifications(d.notifications ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function markRead(ids?: string[]) {
    await fetch("/api/notifications", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(ids ? { ids } : {}),
    });
    setNotifications((prev) =>
      prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n))
    );
  }

  async function handleClick(n: Notification) {
    if (!n.read) await markRead([n.id]);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
        title="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5a6a85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: "0", right: "0",
            background: "#E83B2A", color: "#fff",
            borderRadius: "999px", fontSize: "10px", fontWeight: 700,
            minWidth: "16px", height: "16px", lineHeight: "16px",
            textAlign: "center", padding: "0 3px",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
          background: "#fff", borderRadius: "10px", width: "320px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a" }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markRead()}
                style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "24px", fontSize: "13px", color: "#9ca3af", textAlign: "center" }}>No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: "12px 16px", borderBottom: "1px solid #f0f0f0", cursor: n.link ? "pointer" : "default",
                    background: n.read ? "#fff" : "#fafbfd",
                    borderLeft: n.read ? "3px solid transparent" : "3px solid #E83B2A",
                  }}
                  onMouseEnter={(e) => { if (n.link) (e.currentTarget as HTMLElement).style.background = "#f5f7fa"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = n.read ? "#fff" : "#fafbfd"; }}
                >
                  <div style={{ fontSize: "13px", fontWeight: n.read ? 400 : 700, color: "#1a1a1a", marginBottom: "2px" }}>{n.title}</div>
                  {n.message && <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px", lineHeight: 1.4 }}>{n.message}</div>}
                  <div style={{ fontSize: "11px", color: "#9ca3af" }}>{timeAgo(n.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
