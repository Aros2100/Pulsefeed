"use client";

import type { SubspecialtyBlock } from "./types";
import { nameToSlug } from "./types";

interface SidebarItem {
  key: string;   // "specialty" or slugified name
  label: string;
  pickCount: number;
  isUser: boolean;
}

export function EditionSidebar({
  specialtyPickCount,
  subspecialties,
  userSubNames,
  activeBlock,
  onSelect,
}: {
  specialtyPickCount: number;
  subspecialties: SubspecialtyBlock[];
  userSubNames: string[];
  activeBlock: string;
  onSelect: (block: string) => void;
}) {
  const userSet = new Set(userSubNames.map(n => n.toLowerCase()));

  const userSubs = subspecialties
    .filter(s => userSet.has(s.name.toLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order);

  const otherSubs = subspecialties
    .filter(s => !userSet.has(s.name.toLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order);

  function SectionEyebrow({ label }: { label: string }) {
    return (
      <div style={{
        fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "#94a3b8",
        padding: "6px 10px 4px",
      }}>
        {label}
      </div>
    );
  }

  function Item({ blockKey, label, count, prominent }: {
    blockKey: string; label: string; count: number; prominent: boolean;
  }) {
    const isActive = activeBlock === blockKey;
    return (
      <button
        onClick={() => onSelect(blockKey)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", textAlign: "left",
          padding: prominent ? "8px 10px" : "6px 10px",
          borderRadius: "6px", border: "none",
          background: isActive ? "#F5F1E8" : "transparent",
          cursor: "pointer", fontFamily: "inherit",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.03)"; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        <span style={{
          fontFamily: prominent ? "Georgia, serif" : "inherit",
          fontSize: prominent ? "13px" : "12px",
          color: isActive ? "#1a1a1a" : prominent ? "#1a1a1a" : "#64748b",
          fontWeight: isActive ? 500 : 400,
          flex: 1, minWidth: 0,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {label}
        </span>
        <span style={{
          fontSize: "10px", color: "#94a3b8",
          marginLeft: "6px", flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {count} picks
        </span>
      </button>
    );
  }

  const divider = (
    <div style={{ height: "0.5px", background: "#e5e9f0", margin: "6px 0" }} />
  );

  return (
    <div style={{
      width: "220px", flexShrink: 0,
      background: "#fff",
      borderRadius: "12px",
      border: "0.5px solid #e5e9f0",
      padding: "12px 4px",
      alignSelf: "flex-start",
    }}>
      <SectionEyebrow label="Specialty" />
      <Item blockKey="specialty" label="Neurosurgery" count={specialtyPickCount} prominent />

      {divider}

      {userSubs.length > 0 && (
        <>
          <SectionEyebrow label="Your subspecialties" />
          {userSubs.map(s => (
            <Item key={s.id} blockKey={nameToSlug(s.name)} label={s.short_name ?? s.name} count={s.pick_count} prominent />
          ))}
          {otherSubs.length > 0 && divider}
        </>
      )}

      {otherSubs.length > 0 && (
        <>
          <SectionEyebrow label="Other" />
          {otherSubs.map(s => (
            <Item key={s.id} blockKey={nameToSlug(s.name)} label={s.short_name ?? s.name} count={s.pick_count} prominent={false} />
          ))}
        </>
      )}
    </div>
  );
}
