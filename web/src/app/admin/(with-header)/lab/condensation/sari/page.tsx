import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import SariValidationClient from "../SariValidationClient";

export default async function SariValidationPage() {
  const specialty = ACTIVE_SPECIALTY;
  const label = ACTIVE_SPECIALTY.charAt(0).toUpperCase() + ACTIVE_SPECIALTY.slice(1);

  return <SariValidationClient specialty={specialty} label={label} />;
}
