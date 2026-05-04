"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EditionHeader } from "@/components/editions/EditionHeader";
import { EditionSidebar } from "@/components/editions/EditionSidebar";
import { EditionDetail } from "@/components/editions/EditionDetail";
import type { Edition, EditionArticle, SubspecialtyBlock } from "@/components/editions/types";
import { nameToSlug, slugToName } from "@/components/editions/types";

interface Props {
  edition: Edition;
  isLatest: boolean;
  prevEditionId: string | null;
  nextEditionId: string | null;
  subspecialties: SubspecialtyBlock[];
  userSubNames: string[];
  picksArticles: EditionArticle[];        // all picks for this edition
  specialtyPickCount: number;
  totalArticlesThisWeek: number;
  initialBlock: string;
  initialView: "picks" | "all";
}

function getPicksForBlock(
  block: string,
  articles: EditionArticle[],
  subspecialties: SubspecialtyBlock[],
): EditionArticle[] {
  if (block === "specialty") {
    return articles
      .filter(a => a.is_global)
      .sort((a, b) => (a.global_sort_order ?? 999) - (b.global_sort_order ?? 999) || a.sort_order - b.sort_order);
  }
  const subName = slugToName(block, subspecialties);
  if (!subName) return [];
  return articles
    .filter(a => !a.is_global && a.subspecialty === subName)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function EditionClient({
  edition, isLatest, prevEditionId, nextEditionId,
  subspecialties, userSubNames,
  picksArticles, specialtyPickCount, totalArticlesThisWeek,
  initialBlock, initialView,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeBlock, setActiveBlock] = useState(initialBlock);
  const [view, setView] = useState<"picks" | "all">(initialView);

  const updateUrl = useCallback((block: string, v: "picks" | "all") => {
    const params = new URLSearchParams(searchParams.toString());
    if (block === "specialty") params.delete("block"); else params.set("block", block);
    if (v === "picks") params.delete("view"); else params.set("view", v);
    const qs = params.toString();
    router.replace(`/editions/${edition.id}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, edition.id, searchParams]);

  function handleBlockSelect(block: string) {
    setActiveBlock(block);
    setView("picks"); // reset view when switching blocks
    updateUrl(block, "picks");
  }

  function handleViewChange(v: "picks" | "all") {
    setView(v);
    updateUrl(activeBlock, v);
  }

  const blockPicks = getPicksForBlock(activeBlock, picksArticles, subspecialties);

  const activeSubName = activeBlock === "specialty"
    ? "Neurosurgery"
    : (slugToName(activeBlock, subspecialties) ?? activeBlock);
  const activeSubShort = activeBlock === "specialty"
    ? "Neurosurgery"
    : (subspecialties.find(s => nameToSlug(s.name) === activeBlock)?.short_name ?? activeSubName);

  const pickCountForBlock = activeBlock === "specialty"
    ? specialtyPickCount
    : (subspecialties.find(s => nameToSlug(s.name) === activeBlock)?.pick_count ?? 0);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "#1a1a1a", minHeight: "100vh", background: "#f5f7fa" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px 80px" }}>

        <EditionHeader
          edition={edition}
          isLatest={isLatest}
          prevEditionId={prevEditionId}
          nextEditionId={nextEditionId}
          totalPicks={specialtyPickCount + subspecialties.reduce((s, sub) => s + sub.pick_count, 0)}
          totalArticles={totalArticlesThisWeek}
          currentBlock={activeBlock}
          currentView={view}
        />

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "16px", alignItems: "flex-start" }}>
          <EditionSidebar
            specialtyPickCount={specialtyPickCount}
            subspecialties={subspecialties}
            userSubNames={userSubNames}
            activeBlock={activeBlock}
            onSelect={handleBlockSelect}
          />

          <EditionDetail
            editionId={edition.id}
            blockKey={activeBlock}
            blockLabel={activeSubShort}
            picksArticles={blockPicks}
            allModeTotal={totalArticlesThisWeek}
            onViewChange={handleViewChange}
            initialView={view}
            key={`${activeBlock}-${view}`}
          />
        </div>
      </div>
    </div>
  );
}
