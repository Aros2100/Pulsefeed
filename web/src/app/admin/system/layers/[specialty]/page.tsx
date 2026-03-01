import { notFound } from "next/navigation";
import { SPECIALTIES } from "@/lib/auth/specialties";
import Header from "@/components/Header";
import LayerManager from "@/app/admin/LayerManager";

export default async function LayerPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty } = await params;
  const spec = SPECIALTIES.find((s) => s.slug === specialty);
  if (!spec) notFound();

  return (
    <>
      <Header />
      <LayerManager specialty={spec.slug} label={spec.label} />
    </>
  );
}
