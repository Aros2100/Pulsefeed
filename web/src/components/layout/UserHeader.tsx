"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

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
            <span style={{ display: "flex", alignItems: "center" }}>
              <span style={{ margin: "0 12px", color: "#E83B2A", fontSize: "15px", fontWeight: 400 }}>/</span>
              <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px", color: "#1a1a1a", fontWeight: 400, textTransform: "lowercase", letterSpacing: "0.03em" }}>{ACTIVE_SPECIALTY}</span>
            </span>
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
