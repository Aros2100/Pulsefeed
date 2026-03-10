import Link from "next/link";
import { notFound } from "next/navigation";
import { SPECIALTIES } from "@/lib/auth/specialties";
import LayerManager from "@/app/admin/LayerManager";

export default async function LayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ specialty: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { specialty } = await params;
  const { tab } = await searchParams;
  const spec = SPECIALTIES.find((s) => s.slug === specialty);
  if (!spec) notFound();

  const initialTab = tab === "circle2" ? "circle2" : "circle1";

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 0" }}>
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>
      </div>
      <LayerManager specialty={spec.slug} label={spec.label} initialTab={initialTab} />
    </div>
  );
}
