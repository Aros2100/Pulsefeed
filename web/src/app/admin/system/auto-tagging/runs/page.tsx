export const dynamic = "force-dynamic";

import Link from "next/link";
import { RunHistorySection } from "../_components/RunHistorySection";

export default function AutoTagRunsPage() {
  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{
        fontFamily: "var(--font-inter), Inter, sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 24px 80px",
      }}>
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/auto-tagging" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Auto-Tagging
          </Link>
        </div>

        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
            textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
          }}>
            System · Auto-tagging · Runs
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Auto-tag run history</h1>
        </div>

        <div id="specialty" style={{ scrollMarginTop: "20px" }}>
          <RunHistorySection job="specialty" />
        </div>
        <div id="article-type" style={{ scrollMarginTop: "20px" }}>
          <RunHistorySection job="article_type" />
        </div>
      </div>
    </div>
  );
}
