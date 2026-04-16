"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";

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
    <header style={{ height: 80 }} className="w-full bg-pf-header border-b border-pf-header-border flex items-center px-6">
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center">

        {/* Left — Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
          <svg height="44" viewBox="0 0 220 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="38" height="38" rx="9" fill="#E8403A" />
            <g transform="translate(19,19)" fill="white">
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" />
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" transform="rotate(45)" />
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" transform="rotate(90)" />
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" transform="rotate(135)" />
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" transform="rotate(180)" />
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" transform="rotate(225)" />
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" transform="rotate(270)" />
              <rect x="-3.5" y="-10" width="7" height="9" rx="3.5" transform="rotate(315)" />
              <circle r="3.5" fill="white" />
            </g>
            <text x="48" y="25" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="20" fill="#E8403A">PULSE</text>
            <text x="107" y="25" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="20" fill="#5A5A5A">FEED</text>
            <text x="48" y="34" fontFamily="Arial, sans-serif" fontSize="5.5" fill="#4a7080" letterSpacing="1.8">CLINICAL INTELLIGENCE</text>
          </svg>
          </Link>
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
