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

  return <LayerManager specialty={spec.slug} label={spec.label} initialTab={initialTab} />;
}
