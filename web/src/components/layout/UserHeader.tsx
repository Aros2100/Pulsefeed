"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { ACTIVE_SPECIALTY, AVAILABLE_SPECIALTIES } from "@/lib/auth/specialties";

interface Props {
  activePage: "articles" | "authors";
  mode: "user" | "admin";
  onModeChange: (mode: "user" | "admin") => void;
  onProfileClick?: () => void;
  user: { name: string; initials: string };
  versionPill?: React.ReactNode;
  version?: "v1" | "v2";
}

export default function UserHeader({ activePage, mode, onModeChange, onProfileClick, user, versionPill, version }: Props) {
  const showNav = version !== "v1";
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [dropdownOpen]);

  function handleModeUser() {
    onModeChange("user");
    router.push("/articles");
  }

  function handleModeAdmin() {
    onModeChange("admin");
    router.push("/admin");
  }

  return (
    <header style={{ height: 80 }} className="w-full bg-pf-header flex items-center px-6">
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center">

        {/* Left — Logo + specialty label */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <img src="/pulsefeeds-stacked-onwhite-slate.svg" alt="PulseFeed" style={{ height: "53px", display: "block" }} />
          </Link>
          {ACTIVE_SPECIALTY && (
            <div ref={dropdownRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ margin: "0 12px", color: "#E83B2A", fontSize: "15px", fontWeight: 400 }}>/</span>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                style={{
                  display: "flex", alignItems: "center", gap: "3px",
                  fontFamily: "var(--font-dm-mono), monospace", fontSize: "13px",
                  color: "#1a1a1a", fontWeight: 400, textTransform: "lowercase",
                  letterSpacing: "0.03em", background: "none", border: "none",
                  cursor: "pointer", padding: "3px 5px", borderRadius: "5px",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {ACTIVE_SPECIALTY}
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  style={{
                    marginTop: "1px", flexShrink: 0, color: "#5a6a85",
                    transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.15s",
                  }}
                />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute top-full left-0 z-50 bg-white rounded-xl overflow-hidden"
                  style={{
                    marginTop: "8px",
                    width: "220px",
                    border: "1px solid rgba(0,0,0,0.07)",
                    boxShadow: "0 4px 24px rgba(15,23,42,0.08), 0 1px 4px rgba(15,23,42,0.04)",
                    padding: "6px",
                    animation: "dropdownIn 0.12s ease-out",
                  }}
                >
                  <style>{`@keyframes dropdownIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }`}</style>

                  {/* Your specialty */}
                  <div style={{ padding: "6px 10px 4px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>
                    Your specialty
                  </div>
                  {AVAILABLE_SPECIALTIES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setDropdownOpen(false)}
                      className="w-full flex items-center justify-between rounded-md hover:bg-slate-50 transition-colors"
                      style={{ padding: "7px 10px", textAlign: "left", border: "none", background: "none", cursor: "pointer" }}
                    >
                      <span style={{ fontSize: "13px", textTransform: "capitalize", color: s === ACTIVE_SPECIALTY ? "#E83B2A" : "#1a1a1a", fontWeight: s === ACTIVE_SPECIALTY ? 600 : 400 }}>
                        {s}
                      </span>
                      {s === ACTIVE_SPECIALTY && <Check size={13} strokeWidth={2.5} style={{ color: "#E83B2A", flexShrink: 0 }} />}
                    </button>
                  ))}

                  {/* Coming soon */}
                  <div style={{ padding: "8px 10px 4px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>
                    Coming soon
                  </div>
                  <div style={{ padding: "7px 10px", fontSize: "13px", color: "#94a3b8", cursor: "not-allowed", userSelect: "none" }}>
                    More coming soon
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center — Nav links */}
        <nav className="flex items-center gap-8" style={{ visibility: showNav ? undefined : "hidden" }}>
          <Link
            style={{ height: 80 }}
            href="/articles"
            className={`flex items-center text-[14px] border-b-2 transition-colors ${
              activePage === "articles"
                ? "font-medium text-pf-dark border-pf-red"
                : "text-pf-teal border-transparent hover:text-pf-dark"
            }`}
          >
            Articles
          </Link>
          <Link
            style={{ height: 80 }}
            href="/authors"
            className={`flex items-center text-[14px] border-b-2 transition-colors ${
              activePage === "authors"
                ? "font-medium text-pf-dark border-pf-red"
                : "text-pf-teal border-transparent hover:text-pf-dark"
            }`}
          >
            Authors
          </Link>
        </nav>

        {/* Right — Controls */}
        <div className="flex items-center justify-end gap-2">

          {/* Mode toggle pill */}
          <div className="bg-black/[0.07] rounded-full p-[2px] flex items-center">
            <button
              onClick={handleModeUser}
              className={`font-dm-mono text-[10px] rounded-full px-2.5 py-1 transition-colors ${
                mode === "user"
                  ? "bg-white text-pf-dark font-medium"
                  : "text-pf-teal"
              }`}
            >
              User
            </button>
            <button
              onClick={handleModeAdmin}
              className={`font-dm-mono text-[10px] rounded-full px-2.5 py-1 transition-colors ${
                mode === "admin"
                  ? "bg-white text-pf-dark font-medium"
                  : "text-pf-teal"
              }`}
            >
              Admin
            </button>
          </div>

          {/* Version pill (admin only) */}
          {versionPill}

          {/* Bell */}
          {showNav && <NotificationBell />}

          {/* Avatar pill */}
          <div
            onClick={onProfileClick}
            className="bg-white/80 rounded-full h-[34px] px-3 pl-1.5 gap-2 flex items-center cursor-pointer hover:bg-white transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-pf-header flex items-center justify-center flex-shrink-0">
              <span className="text-pf-teal text-[10px] font-medium leading-none">{user.initials}</span>
            </div>
            <span className="text-pf-dark font-medium text-[13px] pr-0.5">{user.name}</span>
          </div>

        </div>
      </div>
    </header>
  );
}
