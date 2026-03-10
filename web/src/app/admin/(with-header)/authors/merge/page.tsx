import Link from "next/link";
import MergeClient from "./MergeClient";

export default function MergePage() {
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 0" }}>
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/authors" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Forfattere
          </Link>
        </div>
      </div>
      <MergeClient />
    </div>
  );
}
