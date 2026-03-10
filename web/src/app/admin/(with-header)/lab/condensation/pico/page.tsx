import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import PicoValidationClient from "../PicoValidationClient";

export default async function PicoValidationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("specialty_slugs")
    .eq("id", user!.id)
    .single();

  const userSpecialties: string[] = (profile?.specialty_slugs as string[] | null) ?? [];
  const activeSpec = SPECIALTIES.find(
    (s) => s.active && userSpecialties.includes(s.slug)
  ) ?? SPECIALTIES.find((s) => s.active);

  const specialty = activeSpec?.slug ?? "neurosurgery";
  const label = activeSpec?.label ?? "Neurosurgery";

  return <PicoValidationClient specialty={specialty} label={label} />;
}
