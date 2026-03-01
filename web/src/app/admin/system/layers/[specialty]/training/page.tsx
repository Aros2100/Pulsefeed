import { notFound } from "next/navigation";
import { SPECIALTIES } from "@/lib/auth/specialties";
import TrainingClient from "@/app/admin/TrainingClient";

export default async function TrainingPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty } = await params;
  const spec = SPECIALTIES.find((s) => s.slug === specialty);
  if (!spec) notFound();

  return <TrainingClient specialty={spec.slug} label={spec.label} />;
}
