import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import SubspecialtyClient from "../SubspecialtyClient";
import { getSubspecialties } from "@/lib/lab/classification-options";

export default async function ClassificationSessionPage() {
  const specialty = ACTIVE_SPECIALTY;
  const label = ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1);
  const subspecialties = await getSubspecialties(specialty);

  return <SubspecialtyClient specialty={specialty} label={label} subspecialties={subspecialties} />;
}
