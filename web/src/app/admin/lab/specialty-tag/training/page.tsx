import { notFound } from "next/navigation";
import { SPECIALTIES } from "@/lib/auth/specialties";
import TrainingClient from "@/app/admin/TrainingClient";
import { createClient } from "@/lib/supabase/server";

export default async function TrainingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("users").select("specialty_slugs").eq("id", user!.id).single();
  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const spec = SPECIALTIES.find((s) => s.active && userSpecialties.includes(s.slug)) ?? SPECIALTIES.find((s) => s.active);
  if (!spec) notFound();
  return <TrainingClient specialty={spec.slug} label={spec.label} />;
}
